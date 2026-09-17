/**
 * Session state.
 *
 * Deliberately a small context rather than a state library: there are three
 * states (restoring, signed out, signed in) and adding Redux or Zustand for
 * that would be ceremony.
 *
 * The `restoring` state matters. On launch the refresh token has to be read
 * from the keystore, which is async. Without an explicit restoring state the
 * app renders "signed out" for a frame and bounces the agent to the login
 * screen every time they open it.
 */

import * as LocalAuthentication from 'expo-local-authentication';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { refreshAccessTokenWith, setSessionExpiredHandler } from '../api/client';
import * as api from '../api/endpoints';
import {
  clearBiometricCredential,
  clearTokens,
  getBiometricEnabled,
  getBiometricRefreshToken,
  getRefreshToken,
  setAccessToken,
  setBiometricEnabled,
  setBiometricRefreshToken,
  setRefreshToken,
  setRememberedEmail,
} from '../api/tokens';
import {
  hasLocationPermission,
  requestLocationPermissions,
  startLocationTracking,
  stopLocationTracking,
} from '../services/locationTracking';

type Status = 'restoring' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: Status;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  biometricSignIn: () => Promise<'success' | 'failed' | 'unavailable'>;
  enableBiometric: () => Promise<boolean>;
}

/**
 * Silently starts location reporting if permission was already granted in an
 * earlier session. Never prompts -- prompting belongs to the moments a
 * permission is first requested (sign-in, or explicitly from Profile), not to
 * every app launch.
 */
async function resumeLocationTrackingIfPermitted(): Promise<void> {
  const granted = await hasLocationPermission();
  if (granted) startLocationTracking();
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('restoring');
  const signOut = useCallback(async () => {
    await stopLocationTracking();
    const biometricEnabled = await getBiometricEnabled();
    const refresh = await getRefreshToken();

    if (biometricEnabled && refresh) {
      // Agent opted into biometric re-entry: preserve the refresh token as the
      // biometric credential so they can sign back in without typing a password,
      // and clear the main session locally without blacklisting the token.
      await setBiometricRefreshToken(refresh);
      setAccessToken(null);
      await setRefreshToken(null);
    } else {
      if (refresh) await api.logout(refresh).catch(() => undefined);
      await clearTokens();
      await clearBiometricCredential();
    }
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(async () => {
      // Server-side revocation means the biometric credential is also dead.
      await clearBiometricCredential();
      setStatus('signedOut');
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const refresh = await getRefreshToken();
      if (cancelled) return;

      if (!refresh) {
        setStatus('signedOut');
        return;
      }

      // A stored refresh token is treated as a valid session without calling
      // the server first. This is the offline-first choice: an agent who
      // opens the app in a dead spot must still reach their station details
      // and their queued work. Any real request will refresh or fail on its
      // own terms.
      setStatus('signedIn');
      resumeLocationTrackingIfPermitted();
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const tokens = await api.login(email, password);
    setAccessToken(tokens.access);
    await setRefreshToken(tokens.refresh);
    await setRememberedEmail(email.trim().toLowerCase());
    setStatus('signedIn');

    // The closest thing this app has to a "sign up" moment for an
    // invitation-only account: ask once, with the system prompt, rather than
    // silently tracking without ever having asked.
    requestLocationPermissions().then((granted) => {
      if (granted) startLocationTracking();
    });
  }, []);

  const biometricSignIn = useCallback(async (): Promise<'success' | 'failed' | 'unavailable'> => {
    const bioRefresh = await getBiometricRefreshToken();
    if (!bioRefresh) return 'unavailable';

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Sign in to Sentinel',
        cancelLabel: 'Use password instead',
        disableDeviceFallback: false,
      });
      if (!result.success) return 'failed';

      const newAccess = await refreshAccessTokenWith(bioRefresh);
      if (!newAccess) {
        // Refresh token has expired or been revoked server-side.
        await clearBiometricCredential();
        return 'unavailable';
      }

      setAccessToken(newAccess);
      setStatus('signedIn');
      requestLocationPermissions().then((granted) => {
        if (granted) startLocationTracking();
      });
      return 'success';
    } catch {
      return 'failed';
    }
  }, []);

  const enableBiometric = useCallback(async (): Promise<boolean> => {
    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!hasHardware || !isEnrolled) return false;

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify your identity to enable biometric login',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (!result.success) return false;

      const refresh = await getRefreshToken();
      if (!refresh) return false;

      await setBiometricRefreshToken(refresh);
      await setBiometricEnabled(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ status, signIn, signOut, biometricSignIn, enableBiometric }),
    [status, signIn, signOut, biometricSignIn, enableBiometric],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
