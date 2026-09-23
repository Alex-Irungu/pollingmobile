/**
 * Every native biometric call in the app goes through here.
 *
 * Three things about AndroidX BiometricPrompt make the raw API unsafe to call
 * from more than one place:
 *
 * 1. DEVICE CREDENTIAL FALLBACK CRASHES OLDER ANDROID.
 *    expo-local-authentication maps `disableDeviceFallback: false` to
 *    `BIOMETRIC_WEAK | DEVICE_CREDENTIAL`. That combination is rejected by
 *    AndroidX below API 30: `authenticate()` throws IllegalArgumentException,
 *    and the module only catches NullPointerException, so it escapes as an
 *    uncaught native exception and closes the app. On a fleet of cheap
 *    Android 9/10 handsets that is not an edge case. We therefore never allow
 *    the device-credential path: the prompt is biometrics-only, and the
 *    fallback is the app's own password screen, which works identically on
 *    every device and every Android version.
 *
 * 2. THE PROMPT IS A FRAGMENT.
 *    It commits a fragment transaction against the activity, which throws if
 *    the activity is not resumed. Anything that takes focus -- a permission
 *    dialog, the camera, the agent glancing at another app -- can put us
 *    there, so the prompt waits for the activity to be active first.
 *
 * 3. TWO PROMPTS AT ONCE IS A CRASH, NOT AN ERROR.
 *    A second prompt raised while the first is still detaching is refused
 *    natively. One in-flight authentication at a time, enforced here.
 *
 * Capability (hardware present, fingerprint enrolled) is queried once per
 * runtime and cached. It cannot change while the app is open without the
 * agent leaving for Settings, and re-querying the native module repeatedly --
 * particularly moments after a prompt has closed -- was itself a source of
 * crashes.
 */

import * as LocalAuthentication from 'expo-local-authentication';
import { AppState } from 'react-native';

export interface BiometricCapability {
  /** A fingerprint or face sensor exists AND something is enrolled on it. */
  usable: boolean;
}

let capability: Promise<BiometricCapability> | null = null;

/** Hardware and enrolment, queried once and cached for the runtime. */
export function getBiometricCapability(): Promise<BiometricCapability> {
  if (!capability) {
    capability = (async () => {
      try {
        const [hasHardware, isEnrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        return { usable: hasHardware && isEnrolled };
      } catch {
        // A device that cannot answer the question is a device we do not
        // offer the feature on.
        return { usable: false };
      }
    })();
  }
  return capability;
}

/** Resolves once the activity is foregrounded -- see note 2 above. */
function waitForActive(): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        subscription.remove();
        resolve();
      }
    });
  });
}

let inFlight = false;

export type BiometricResult = 'success' | 'cancelled' | 'unavailable';

/**
 * Show the system biometric prompt.
 *
 * Never throws and never closes the app: any failure is reported as
 * 'unavailable' so the caller can fall back to the password screen.
 */
export async function promptBiometric(promptMessage: string): Promise<BiometricResult> {
  if (inFlight) return 'cancelled';

  const { usable } = await getBiometricCapability();
  if (!usable) return 'unavailable';

  inFlight = true;
  try {
    await waitForActive();

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Use password instead',
      // See note 1: biometrics only. The app's password screen is the
      // fallback, not the device PIN.
      disableDeviceFallback: true,
      requireConfirmation: false,
    });

    if (result.success) return 'success';

    // The agent dismissed it, or the sensor refused them. Either way the
    // password screen is right there; this is not an error state.
    return 'cancelled';
  } catch {
    return 'unavailable';
  } finally {
    inFlight = false;
  }
}
