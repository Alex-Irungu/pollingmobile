/**
 * React view of the persistent message outbox. Same shape as
 * useSubmissionQueue: the outbox changes from timers and network events, so
 * useSyncExternalStore is the honest primitive.
 */

import { useSyncExternalStore } from 'react';

import {
  getOutboxState,
  subscribeOutbox,
  type OutboxEntry,
} from '../services/messageOutbox';

export function useOutbox(): { entries: OutboxEntry[]; sending: boolean } {
  return useSyncExternalStore(subscribeOutbox, getOutboxState, getOutboxState);
}
