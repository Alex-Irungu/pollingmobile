/**
 * Chat state.
 *
 * Polling, not websockets. The backend has a Channels consumer, but a socket
 * held open on a cheap phone with intermittent 2G costs battery and reconnect
 * churn for a chat that is low-volume by nature. A 6-second poll of a
 * cursor-based endpoint is cheaper and, more importantly, cannot silently
 * die -- a dead socket looks exactly like an empty conversation, which is the
 * worst possible failure for an agent waiting on instructions.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';

import * as api from '../api/endpoints';
import type { ChatMessage } from '../api/types';

export const messagesQueryKey = ['messages'] as const;
export const conversationQueryKey = ['conversation'] as const;

const POLL_INTERVAL_MS = 6000;

export function useMessages() {
  return useQuery({
    queryKey: messagesQueryKey,
    queryFn: async () => {
      const response = await api.fetchMessages();
      return response.results;
    },
    refetchInterval: POLL_INTERVAL_MS,
    // Keep polling in the background so the tab badge stays honest even while
    // the agent is on the submit screen.
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}

export function useConversation() {
  return useQuery({
    queryKey: conversationQueryKey,
    queryFn: api.fetchConversation,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/** Unread dot for the tab bar. */
export function useUnreadCount(): number {
  const { data } = useQuery({
    queryKey: conversationQueryKey,
    queryFn: api.fetchConversation,
    refetchInterval: POLL_INTERVAL_MS,
  });
  return data?.unread ?? 0;
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.sendMessage,

    /**
     * Optimistic insert.
     *
     * The bubble appears the instant the agent hits send, marked as pending,
     * rather than after a round trip. On a slow connection the alternative is
     * a message that seems not to have sent, and an agent who types it again.
     */
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: messagesQueryKey });
      const previous = queryClient.getQueryData<ChatMessage[]>(messagesQueryKey);

      const optimistic: ChatMessage = {
        id: `pending-${payload.client_uuid}`,
        kind: payload.kind,
        body: payload.body ?? '',
        attachment: null,
        from_agent: true,
        sender_name: 'You',
        client_uuid: payload.client_uuid,
        submission: payload.submission_id ?? null,
        read_at: null,
        created_at: new Date().toISOString(),
      };

      queryClient.setQueryData<ChatMessage[]>(messagesQueryKey, [
        ...(previous ?? []),
        optimistic,
      ]);

      return { previous };
    },

    onError: (_error, _payload, context) => {
      // Roll back, so a failed send does not leave a bubble that looks
      // delivered.
      if (context?.previous) {
        queryClient.setQueryData(messagesQueryKey, context.previous);
      }
    },

    onSuccess: (saved) => {
      // Replace the optimistic row with the server's, matched on client_uuid.
      queryClient.setQueryData<ChatMessage[]>(messagesQueryKey, (current) => {
        if (!current) return [saved];
        const withoutPending = current.filter(
          (m) => m.client_uuid !== saved.client_uuid || !m.id.startsWith('pending-'),
        );
        return withoutPending.some((m) => m.id === saved.id)
          ? withoutPending
          : [...withoutPending, saved];
      });
      queryClient.invalidateQueries({ queryKey: conversationQueryKey });
    },
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    api
      .markMessagesRead()
      .then(() => {
        queryClient.invalidateQueries({ queryKey: conversationQueryKey });
      })
      // Failing to clear a read receipt is cosmetic; never surface it.
      .catch(() => undefined);
  }, [queryClient]);
}
