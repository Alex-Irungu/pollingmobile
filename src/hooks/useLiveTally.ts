/**
 * Live race tally for the agent's own race.
 *
 * Polled, not pushed. The command centre's web dashboard gets these numbers
 * over a websocket; a field phone on 2G gets them by asking every 30 seconds
 * while the screen is open. Same freshness an agent can perceive, none of the
 * battery and reconnect cost a held-open socket charges a cheap phone (the
 * same trade chat made -- see useChat.ts).
 *
 * Failures are silent by design: this is ambient context, not the agent's
 * job. If the endpoint is briefly down the ballot list simply shows without
 * numbers, and the next poll tries again.
 */

import { useQuery } from '@tanstack/react-query';

import * as api from '../api/endpoints';

const TALLY_POLL_INTERVAL_MS = 30_000;

export function useLiveTally(raceId: string | null | undefined) {
  return useQuery({
    queryKey: ['liveTally', raceId ?? 'none'],
    queryFn: () => api.fetchLiveTally(raceId as string),
    enabled: !!raceId,
    refetchInterval: TALLY_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    staleTime: 20_000,
    // Ambient data: one failed poll should neither hammer the server with
    // retries nor surface an error screen. The interval is the retry.
    retry: false,
  });
}
