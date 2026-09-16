/**
 * Where the backend lives.
 *
 * A phone cannot reach "localhost" -- that resolves to the phone itself. On a
 * physical device the app must use the development machine's LAN address, and
 * on the Android emulator the host is reachable at the special 10.0.2.2.
 *
 * Expo tells us the address the bundler was served from, so the LAN IP is
 * derived rather than hardcoded. That matters because the dev machine's IP
 * changes with the network, and a hardcoded value is a guaranteed support call.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEV_PORT = 8000;

/**
 * Deployed backend. Used whenever the app is not running under the Metro
 * dev server (i.e. any real build a build profile forgot to set
 * EXPO_PUBLIC_API_URL for) -- without this, a production/preview build built
 * outside eas.json's env block would silently fall back to inferDevHost()'s
 * emulator alias, which no real phone can ever reach, and every request
 * would fail instantly with "No connection".
 */
const PRODUCTION_API_URL = 'https://sentinel-backend-g6um.onrender.com';

/** `EXPO_PUBLIC_API_URL` wins when set, for pointing at staging or production. */
const explicit = process.env.EXPO_PUBLIC_API_URL;

function inferDevHost(): string {
  // e.g. "192.168.1.24:8081" for the Metro bundler.
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost ??
    '';

  const host = hostUri.split(':')[0];

  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:${DEV_PORT}`;
  }

  // Emulators: each platform exposes the host machine on its own alias.
  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${DEV_PORT}`;
  }
  return `http://127.0.0.1:${DEV_PORT}`;
}

export const API_BASE_URL = explicit ?? (__DEV__ ? inferDevHost() : PRODUCTION_API_URL);
export const API_URL = `${API_BASE_URL}/api/v1`;

/**
 * Request timeout. Generous, because election-night mobile data is slow and a
 * submission that would have succeeded in 20 seconds must not be abandoned at
 * 10. Also has to cover the free-tier backend's cold start (Render spins the
 * instance down after inactivity and can take 30-50s to wake), or every
 * first request after a quiet spell would time out and read as "no
 * connection" even with a perfectly good signal. Uploads use their own,
 * longer budget.
 */
export const REQUEST_TIMEOUT_MS = 45_000;
export const UPLOAD_TIMEOUT_MS = 120_000;
