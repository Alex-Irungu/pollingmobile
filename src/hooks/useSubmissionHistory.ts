/**
 * The agent's own submission history -- every Form 34A photo they have sent,
 * most recent first.
 *
 * Not persisted to AsyncStorage like `usePosting`: this is a review screen an
 * agent opens occasionally, not something needed offline at the moment they
 * have no signal. A plain network-backed query keeps the data honest (status
 * can change after the command centre reviews it) without extra cache
 * plumbing for a screen that is not on the critical submit path.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '../api/endpoints';
import { conversationQueryKey, messagesQueryKey } from './useChat';

export const submissionHistoryQueryKey = ['submission-history'] as const;

export function useSubmissionHistory() {
  return useQuery({
    queryKey: submissionHistoryQueryKey,
    queryFn: async () => {
      const response = await api.fetchSubmissionHistory();
      return response.results;
    },
    staleTime: 60_000,
  });
}

/** Reply to a command-centre question about a specific submission. */
export function useReplyToSubmission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ submissionId, body }: { submissionId: string; body: string }) =>
      api.sendMessage({
        kind: 'TEXT',
        body,
        client_uuid: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        submission_id: submissionId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: submissionHistoryQueryKey });
      // The reply also lands in the general chat thread, so keep that in
      // sync too rather than waiting for its own next 6s poll.
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
      queryClient.invalidateQueries({ queryKey: conversationQueryKey });
    },
  });
}
