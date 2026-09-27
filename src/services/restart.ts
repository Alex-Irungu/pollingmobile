/**
 * Restarting the app's JS runtime.
 *
 * Sign-out cannot be done cleanly in-process. The signed-in part of the app
 * leaves state in a dozen places that outlive it: requests on the wire, poll
 * timers, a React Query cache, reanimated shared values and Expo Router's
 * navigator state.
 *
 * Rather than chase each subsystem's JS teardown, sign-out reloads the bundle.
 * Every re-login then starts from fresh JS state, which is the one path
 * already known to be reliable for everything that lives in JS. This is what
 * the Dispatch web app gets for free from `window.location.href = '/login'`.
 *
 * What a reload is NOT: a new process. The Android Activity and any native
 * module state survive it untouched. Anything that must be remembered across
 * a sign-out cannot live in a module variable -- a variable is reset to its
 * initial value by exactly the event it was meant to remember.
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
