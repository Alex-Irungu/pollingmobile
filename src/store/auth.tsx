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

import { QueryClient, useQueryClient } from '@tanstack/react-query';
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
  ensureLocationTracking,
  requestLocationPermissions,
  startLocationTracking,
  stopLocationTracking,
} from '../services/locationTracking';
import { unregisterPushNotifications } from '../services/pushNotifications';
import { restartApp } from '../services/restart';
import { getBiometricCapability, promptBiometric } from '../services/biometrics';
import { clearPostingCache, postingQueryKey } from '../hooks/usePosting';

type Status = 'restoring' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: Status;
  /** How the current session was entered. The biometric setup offer is only
   * made after a password sign-in -- there is nothing to offer someone who
   * just used their fingerprint. */
  lastSignInMethod: 'password' | 'biometric' | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  biometricSignIn: () => Promise<'success' | 'failed' | 'unavailable'>;
  enableBiometric: () => Promise<boolean>;
}

/**
 * Starts location reporting on entering a signed-in session: silently when
 * permission is already granted, with the one-time system prompt when it has
 * never been asked on this install (see ensureLocationTracking). A denied
 * permission is left alone -- re-enabling belongs to Profile.
 */
function resumeLocationTrackingIfPermitted(): void {
  void ensureLocationTracking();
}

/**
 * Starts the home screen's fetch at the moment of sign-in rather than when
 * that screen mounts. On a cheap phone, navigating and rendering the tab
 * navigator costs a few hundred milliseconds; issuing the request first
 * overlaps it with the network instead of queueing behind it. Fire and
 * forget -- the screen's own useQuery picks up whatever this produced.
 */
function prefetchPosting(queryClient: QueryClient): void {
  void queryClient
    .prefetchQuery({ queryKey: postingQueryKey, queryFn: api.fetchPosting })
    .catch(() => undefined);
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
      // The device stays bound to this agent, so their station stays cached
      // on disk too: the next fingerprint sign-in opens straight onto it
      // instead of a spinner waiting on the network.
      await setBiometricRefreshToken(refresh);
      setAccessToken(null);
      await setRefreshToken(null);
    } else {
      // Fire-and-forget, before the tokens go: a full sign-out releases the
      // device, and the next holder must not get this agent's notifications.
      // No await -- sign-out must not wait on a slow network for a courtesy.
      void unregisterPushNotifications();
      if (refresh) await api.logout(refresh).catch(() => undefined);
      await clearTokens();
      await clearBiometricCredential();
      // A full sign-out releases the device. The next agent to use it must not
      // see the previous one's station.
      await clearPostingCache();
    }

    // Credentials are gone, so the app is safe whatever happens next. Now hand
    // the next sign-in a clean runtime: see services/restart.ts. This happens
    // BEFORE the status flip on purpose. Flipping first rendered the login
    // screen inside the runtime that was about to be torn down, and on a slow
    // phone that screen was live for a second or more -- long enough to tap
    // the fingerprint button and commit a biometric prompt against a dying
    // host, which closes the app. The agent instead sees the screen they were
    // on hold still, then the splash, then a login screen in a fresh runtime.
    const restarted = await restartApp();
    if (restarted) return;

    // No updates module to reload through (Expo Go, dev client). Fall back to
    // clearing in-process. The cache clear runs after the status flip, so it
    // lands on an unmounted tree rather than yanking data out from under
    // screens still rendering it.
    setStatus('signedOut');
    setTimeout(() => queryClient.clear(), 0);
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
    prefetchPosting(queryClient);
    setStatus('signedIn');

    // The closest thing this app has to a "sign up" moment for an
    // invitation-only account: ask once, with the system prompt, rather than
    // silently tracking without ever having asked.
    requestLocationPermissions().then((granted) => {
      if (granted) startLocationTracking();
    });
  }, [queryClient]);

  const biometricSignIn = useCallback(async (): Promise<'success' | 'failed' | 'unavailable'> => {
    const bioRefresh = await getBiometricRefreshToken();
    if (!bioRefresh) return 'unavailable';

    try {
      const outcome = await promptBiometric('Sign in to Sentinel');
      if (outcome === 'unavailable') return 'unavailable';
      if (outcome !== 'success') return 'failed';

      const tokens = await refreshAccessTokenWith(bioRefresh);
      if (!tokens) {
        // Refresh token has expired or been revoked server-side.
        await clearBiometricCredential();
        return 'unavailable';
      }

      invalidateSession();
      setAccessToken(tokens.access);
      // The server rotated the credential we just spent, so both copies are
      // replaced with the new one: the main session's, without which the
      // first 401 fifteen minutes from now has no refresh token and drops the
      // agent to the login screen mid-shift, and the biometric copy, without
      // which the next fingerprint sign-in presents a blacklisted token.
      await setRefreshToken(tokens.refresh);
      await setBiometricRefreshToken(tokens.refresh);
      setLastSignInMethod('biometric');
      prefetchPosting(queryClient);
      setStatus('signedIn');
      // Re-entry, not first entry: permissions were asked for at the password
      // sign-in. Asking again here put a system dialog -- or on Android 11+,
      // the Settings app -- in front of the agent on every fingerprint login,
      // and backgrounded the app in the same instant the location service was
      // trying to start.
      resumeLocationTrackingIfPermitted();
      return 'success';
    } catch {
      return 'failed';
    }
  }, [queryClient]);

  const enableBiometric = useCallback(async (): Promise<boolean> => {
    try {
      const { usable } = await getBiometricCapability();
      if (!usable) return false;

      const outcome = await promptBiometric(
        'Verify your identity to enable biometric login',
      );
      if (outcome !== 'success') return false;

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
