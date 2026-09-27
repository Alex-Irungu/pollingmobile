/**
 * React view of the offline submission queue.
 *
 * useSyncExternalStore rather than useState-plus-effect: the queue changes
 * from timers and network events that have nothing to do with React's
 * lifecycle, and this is the primitive built for exactly that.
 */

import { useSyncExternalStore } from 'react';

import {
  getQueueState,
  subscribeQueue,
  type QueueState,
} from '../services/submissionQueue';

export function useSubmissionQueue(): QueueState {
  return useSyncExternalStore(subscribeQueue, getQueueState, getQueueState);
}
