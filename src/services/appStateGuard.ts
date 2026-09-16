/**
 * Suppresses the biometric re-lock (see `store/auth.tsx`) around app actions
 * that legitimately take the app to the OS "inactive"/"background" state and
 * back -- the system camera, the photo library, and permission dialogs -- so
 * they are not mistaken for the agent actually leaving the app.
 *
 * Without this, opening the camera to photograph a declaration form would
 * hand control to a different Activity, and coming back would look
 * indistinguishable from switching away to another app: the AppState
 * listener would re-lock behind Face/Touch ID and reset navigation to the
 * home tab, throwing away whatever the agent was in the middle of doing.
 *
 * The suppression window is held open for a short grace period after the
 * triggering call resolves, because on Android the AppState "active" event
 * for the returning app can arrive slightly after the promise that returned
 * control does.
 */

const GRACE_MS = 700;

let suppressUntil = 0;

export function isRelockSuppressed(): boolean {
  return Date.now() < suppressUntil;
}

export async function withRelockSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  // Held at "forever" (a far-future timestamp) for the duration of the call,
  // in case the underlying system UI takes longer than any fixed window --
  // an agent can spend as long as they like framing the photo.
  suppressUntil = Number.MAX_SAFE_INTEGER;
  try {
    return await fn();
  } finally {
    suppressUntil = Date.now() + GRACE_MS;
  }
}
