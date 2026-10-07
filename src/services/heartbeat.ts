/**
 * Device heartbeat for the command centre's system health page.
 *
 * The server cannot see a phone's offline queue, and it cannot tell "agent is
 * quiet" from "agent's phone is dead" without hearing from it. This reports
 * two facts every few minutes while the app is open, on each return to it,
 * and whenever the queue changes: the phone is alive, and how many results /
 * messages are still waiting to be sent (and since when).
 *
 * Best-effort like location pings: every failure is swallowed, because a
 * missed heartbeat on bad signal is exactly the thing it exists to measure.
 */

import Constants from 'expo-constants';
import { AppState } from 'react-native';

import { sendHeartbeat } from '../api/endpoints';
import { getOutboxState, subscribeOutbox } from './messageOutbox';
import { getQueueState, subscribeQueue } from './submissionQueue';

const INTERVAL_MS = 3 * 60 * 1000;
/** Queue changes can come in bursts (one entry sent, the next starts); wait
 * for them to settle rather than posting for each. */
const CHANGE_DEBOUNCE_MS = 3_000;
const MIN_GAP_MS = 20_000;

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;
let unsubscribers: Array<() => void> = [];
let lastSentAt = 0;
let inFlight = false;

function backlog(): { count: number; oldest: string | null } {
  const queue = getQueueState();
  const times: string[] = [];
  // A rejected record is not "waiting to send": the agent must act on it.
  if (queue.kind === 'pending') times.push(queue.record.queuedAt);
  for (const entry of getOutboxState().entries) times.push(entry.queuedAt);
  times.sort();
  return { count: times.length, oldest: times[0] ?? null };
}

async function beat(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const { count, oldest } = backlog();
    await sendHeartbeat({
      pending_count: count,
      oldest_pending_at: oldest,
      app_version: Constants.expoConfig?.version ?? '',
    });
    lastSentAt = Date.now();
  } catch {
    // Offline or server asleep: the next tick tries again.
  } finally {
    inFlight = false;
  }
}

function scheduleChangeBeat(): void {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    void beat();
  }, CHANGE_DEBOUNCE_MS);
}

/** Start reporting. Idempotent; call from the signed-in agent layout. */
export function startHeartbeat(): void {
  if (started) return;
  started = true;

  void beat();
  timer = setInterval(() => {
    if (AppState.currentState === 'active') void beat();
  }, INTERVAL_MS);

  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active' && Date.now() - lastSentAt > MIN_GAP_MS) void beat();
  });
  unsubscribers = [subscribeQueue(scheduleChangeBeat), subscribeOutbox(scheduleChangeBeat), () => appState.remove()];
}

/** Stop reporting. Called on sign-out so a signed-out phone stays silent. */
export function stopHeartbeat(): void {
  started = false;
  if (timer) clearInterval(timer);
  if (debounce) clearTimeout(debounce);
  timer = null;
  debounce = null;
  unsubscribers.forEach((fn) => fn());
  unsubscribers = [];
}
