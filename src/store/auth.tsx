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

import { useQueryClient } from '@tanstack/react-query';
import * as LocalAuthentication from 'expo-local-authentication';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  invalidateSession,
  refreshAccessTokenWith,
  setSessionExpiredHandler,
} from '../api/client';
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
import { restartApp } from '../services/restart';

type Status = 'restoring' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: Status;
  /**
   * How the current 'signedIn' session was entered. NavigationGate uses this
   * to decide whether it is safe to re-query the biometric hardware right
   * after sign-in -- see biometricSignIn below for why that matters.
   */
  lastSignInMethod: 'password' | 'biometric' | null;
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
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('restoring');
  const [lastSignInMethod, setLastSignInMethod] = useState<'password' | 'biometric' | null>(
    null,
  );
  const signOut = useCallback(async () => {
    // Order matters. The session is retired *first*, so that anything the
    // signed-in screens already have on the wire (a chat poll, a posting
    // fetch) cannot come back with a 401 after the agent has signed in again
    // and take the new session down with it.
    invalidateSession();
    setLastSignInMethod(null);

    // In-flight queries are cancelled so a response cannot repopulate the
    // cache a second after sign-out. The cache itself is emptied below, once
    // the signed-in screens have unmounted.
    await queryClient.cancelQueries().catch(() => undefined);

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

    // Credentials are gone, so the app is safe whatever happens next. Now hand
    // the next sign-in a clean process: see services/restart.ts for why an
    // in-process sign-out cannot be made reliable. The agent sees the native
    // splash for a moment and lands on the login screen, exactly as if they
    // had force-closed and reopened the app.
    const restarted = await restartApp();

    if (!restarted) {
      // No updates module to reload through (Expo Go, dev client). Fall back
      // to clearing in-process. After the status flip, so the clear lands on an
      // unmounted tree rather than yanking data out from under screens still
      // rendering it. The next agent on this device must not see the previous
      // one's station or messages.
      setTimeout(() => queryClient.clear(), 0);
    }
  }, [queryClient]);

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
    // New session: anything still outstanding from the previous one is now
    // stale and must not be able to refresh or expire these tokens.
    invalidateSession();
    setAccessToken(tokens.access);
    await setRefreshToken(tokens.refresh);
    await setRememberedEmail(email.trim().toLowerCase());
    setLastSignInMethod('password');
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

      invalidateSession();
      setAccessToken(newAccess);
      // Restore the main session credential too. Without this the session
      // holds only a 15-minute access token: the first 401 after that has no
      // refresh token to spend and drops the agent back to the login screen
      // mid-shift.
      await setRefreshToken(bioRefresh);
      setLastSignInMethod('biometric');
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
    () => ({ status, lastSignInMethod, signIn, signOut, biometricSignIn, enableBiometric }),
    [status, lastSignInMethod, signIn, signOut, biometricSignIn, enableBiometric],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
