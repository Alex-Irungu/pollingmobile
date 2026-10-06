/**
 * Live emergencies for the command-centre side of the mobile app.
 *
 * Polled fast: an unanswered panic alert is the one thing on this screen
 * that cannot wait for a pull-to-refresh. Shares one query key so the
 * dashboard card and anything else that needs the count ride a single request.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '../api/endpoints';
import type { EmergencyAlert } from '../api/types';

export const emergenciesQueryKey = ['admin', 'emergencies'] as const;

const EMERGENCY_POLL_MS = 10_000;

export function useEmergencies(enabled = true) {
  const query = useQuery({
    queryKey: emergenciesQueryKey,
    queryFn: () => api.fetchEmergencies('active'),
    refetchInterval: EMERGENCY_POLL_MS,
    refetchIntervalInBackground: false,
    enabled,
  });
  return {
    emergencies: query.data?.results ?? [],
    activeCount: query.data?.active_count ?? 0,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useEmergencyStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: 'ACKNOWLEDGED' | 'DISPATCHED' | 'RESOLVED';
    }) => api.setEmergencyStatus(id, status),
    onSuccess: (updated: EmergencyAlert) => {
      // A resolved alert leaves the active list at once; others update in place.
      queryClient.setQueryData<{ active_count: number; results: EmergencyAlert[] }>(
        emergenciesQueryKey,
        (current) => {
          if (!current) return current;
          const results = updated.is_active
            ? current.results.map((e) => (e.id === updated.id ? updated : e))
            : current.results.filter((e) => e.id !== updated.id);
          return { active_count: results.length, results };
        },
      );
      queryClient.invalidateQueries({ queryKey: ['admin', 'inbox'] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: emergenciesQueryKey });
    },
  });
}
