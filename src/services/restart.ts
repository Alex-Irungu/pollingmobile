/**
 * Restarting the app's JS runtime.
 *
 * Sign-out cannot be done cleanly in-process. The signed-in part of the app
 * leaves state in a dozen places that outlive it: requests on the wire, poll
 * timers, a React Query cache, reanimated shared values, Expo Router's
 * navigator state, and -- the expensive one -- native modules like
 * expo-task-manager and the Android location foreground service, which is
 * stopped asynchronously and only really gone some seconds later.
 *
 * Signing straight back in re-enters that half-dismantled process, and
 * starting a location foreground service while the previous instance is still
 * being destroyed throws natively, past any JS try/catch, closing the app. The
 * agent then signs in a second time -- into a fresh process -- and it works.
 * That asymmetry is the whole bug.
 *
 * Rather than chase each subsystem's teardown, sign-out restarts the runtime.
 * Every re-login is then a first-login in a clean process, which is the one
 * path already known to be reliable. This is what the Dispatch web app gets
 * for free from `window.location.href = '/login'`: a hard reload that throws
 * the whole document away.
 */

import * as Updates from 'expo-updates';

/**
 * Reloads the JS bundle, as a cold start would.
 *
 * Returns false when the runtime cannot be reloaded -- Expo Go and the dev
 * client have no updates module to reload through. Callers must still leave
 * the app in a correct signed-out state on their own in that case; this is an
 * optimisation for correctness, not a substitute for it.
 */
export async function restartApp(): Promise<boolean> {
  try {
    await Updates.reloadAsync();
    return true;
  } catch {
    return false;
  }
}
