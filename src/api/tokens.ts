/**
 * Token storage.
 *
 * The refresh token goes into the OS keystore (iOS Keychain / Android
 * Keystore) via expo-secure-store, NOT AsyncStorage. AsyncStorage is an
 * unencrypted file; on a rooted or seized phone it is readable. A polling-
 * station agent's device is exactly the device you should assume can be taken.
 *
 * The access token is held in memory only. It lives 15 minutes, so persisting
 * it buys almost nothing and widens the window in which a stolen phone can be
 * used without the keystore.
 */

import * as SecureStore from 'expo-secure-store';

const REFRESH_KEY = 'sentinel.refresh';
const AGENT_EMAIL_KEY = 'sentinel.email';

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_KEY);
  } catch {
    // A keystore read can fail on a device with a corrupted keychain. Treat it
    // as "not signed in" rather than crashing the app on launch.
    return null;
  }
}

export async function setRefreshToken(token: string | null): Promise<void> {
  if (token === null) {
    await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => undefined);
    return;
  }
  await SecureStore.setItemAsync(REFRESH_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/**
 * The last signed-in email, so the login screen can pre-fill it.
 *
 * Convenience only, and worth it: agents type this at 5am on a small keyboard.
 * It is not a credential.
 */
export async function getRememberedEmail(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(AGENT_EMAIL_KEY);
  } catch {
    return null;
  }
}

export async function setRememberedEmail(email: string | null): Promise<void> {
  if (email === null) {
    await SecureStore.deleteItemAsync(AGENT_EMAIL_KEY).catch(() => undefined);
    return;
  }
  await SecureStore.setItemAsync(AGENT_EMAIL_KEY, email).catch(() => undefined);
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  await setRefreshToken(null);
}

const BIOMETRIC_ENABLED_KEY = 'sentinel.biometricEnabled';

/**
 * Whether the agent has opted into unlocking the app with Face/Touch ID or a
 * fingerprint, in addition to the normal signed-in session. Off by default:
 * enabling it is a deliberate choice made from the Profile screen, once the
 * device has proven it can actually authenticate.
 */
export async function getBiometricEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false').catch(
    () => undefined,
  );
}

const RELOCK_SUPPRESS_UNTIL_KEY = 'sentinel.relockSuppressUntil';

/**
 * A timestamp (ms epoch), persisted rather than kept in memory, marking how
 * long the biometric re-lock should stay suppressed for.
 *
 * This has to survive a full process restart: opening the system camera can
 * get the app's own process killed by Android to reclaim memory on a low-RAM
 * field phone, and when it comes back the JS runtime starts completely fresh
 * -- any in-memory flag would already be gone by the time it matters. Reading
 * this from disk on that fresh start is what stops the agent being thrown
 * back to a fingerprint prompt (and losing their place) after every photo.
 */
export async function getRelockSuppressUntil(): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(RELOCK_SUPPRESS_UNTIL_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function setRelockSuppressUntil(timestamp: number): Promise<void> {
  await SecureStore.setItemAsync(RELOCK_SUPPRESS_UNTIL_KEY, String(timestamp)).catch(
    () => undefined,
  );
}
