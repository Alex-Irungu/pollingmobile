/**
 * Suppresses the biometric re-lock (see `store/auth.tsx`) around app actions
 * that legitimately take the app to the OS "inactive"/"background" state and
 * back -- the system camera, the photo library, and permission dialogs -- so
 * they are not mistaken for the agent actually leaving the app.
 *
 * Without this, opening the camera to photograph a declaration form would
 * hand control to a different Activity, and coming back would look
 * indistinguishable from switching away to another app: the app would
 * re-lock behind Face/Touch ID and reset navigation to the home tab, throwing
 * away whatever the agent was in the middle of doing.
 *
 * This state is persisted (via SecureStore), not just held in memory, because
 * on a low-RAM field phone Android can outright kill the app's process while
 * the camera is in the foreground to reclaim memory. When the agent returns,
 * the JS runtime starts completely fresh -- an in-memory flag would already
 * be gone by the time `store/auth.tsx` decides whether to show the lock
 * screen on that fresh start, which is exactly the case an in-memory-only
 * suppression flag could not cover.
 */

import { getRelockSuppressUntil, setRelockSuppressUntil } from '../api/tokens';

// Generous upper bound for how long the system UI might stay open -- an
// agent can take as long as they like framing the photo. If the process is
// killed entirely while this is in effect and never reaches the `finally`
// below, this bound is what stops the bypass from lasting forever.
const ACTIVE_MS = 10 * 60 * 1000;

// Extra grace after the triggering call resolves, because on Android the
// AppState "active" event for the returning app can arrive slightly after
// the promise that returned control does.
const GRACE_MS = 2000;

export async function isRelockSuppressed(): Promise<boolean> {
  const until = await getRelockSuppressUntil();
  return Date.now() < until;
}

export async function withRelockSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  await setRelockSuppressUntil(Date.now() + ACTIVE_MS);
  try {
    return await fn();
  } finally {
    await setRelockSuppressUntil(Date.now() + GRACE_MS);
  }
}
