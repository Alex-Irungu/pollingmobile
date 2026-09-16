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
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { isRelockSuppressed } from '../services/appStateGuard';
import { setSessionExpiredHandler } from '../api/client';
import * as api from '../api/endpoints';
import {
  clearTokens,
  getBiometricEnabled,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  setRememberedEmail,
} from '../api/tokens';
import {
  hasLocationPermission,
  requestLocationPermissions,
  startLocationTracking,
  stopLocationTracking,
} from '../services/locationTracking';

// 'locked' sits between a restored session and full access: the refresh token
// is valid, but the agent opted into a biometric gate (see Profile) and has
// not yet passed it this launch. It is deliberately its own state rather than
// folded into 'signedOut' -- the app must not throw away the session or route
// through the password form just because the phone was put down for a minute.
type Status = 'restoring' | 'signedOut' | 'locked' | 'signedIn';

interface AuthValue {
  status: Status;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Prompts Face/Touch ID or a fingerprint to leave the 'locked' state. */
  unlock: () => Promise<boolean>;
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
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Re-lock every time the app returns from the background, not just on cold
  // start. Without this, enabling biometrics only ever gated the very first
  // launch of the process -- switching away and back left the app wide open,
  // which defeats the point of the toggle.
  useEffect(() => {
    let previousState: AppStateStatus = AppState.currentState;

    const subscription = AppState.addEventListener('change', async (next) => {
      const previous = previousState;
      previousState = next;

      const cameToForeground =
        (previous === 'background' || previous === 'inactive') && next === 'active';
      if (!cameToForeground) return;
      if (statusRef.current !== 'signedIn') return;

      // The camera, photo library, and permission dialogs all briefly hand
      // control to a different Activity, which looks identical to the agent
      // switching away to another app. Re-locking on the way back from one of
      // those would throw away whatever they were in the middle of doing.
      if (await isRelockSuppressed()) return;

      const biometricEnabled = await getBiometricEnabled();
      if (biometricEnabled) setStatus('locked');
    });

    return () => subscription.remove();
  }, []);

  const signOut = useCallback(async () => {
    // A signed-out device must not keep reporting a position for an agent who
    // is no longer using it.
    await stopLocationTracking();
    const refresh = await getRefreshToken();
    if (refresh) {
      // Blacklist server-side so a copied token cannot be reused. Best effort:
      // if the agent is offline we still sign them out locally, because the
      // alternative is refusing to sign out at all.
      await api.logout(refresh).catch(() => undefined);
    }
    await clearTokens();
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    // The client calls this when a refresh definitively fails, e.g. the
    // command centre deactivated the agent. Clears local state immediately.
    setSessionExpiredHandler(() => {
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
      const biometricEnabled = await getBiometricEnabled();
      if (cancelled) return;

      // This effect also runs on a cold start caused by Android killing the
      // whole process to reclaim memory while the camera (or another system
      // dialog) was open on top of it -- not just a genuine fresh launch. A
      // re-lock suppressed for that reason (see appStateGuard.ts) must still
      // be honoured here, since the entire JS runtime restarted and never
      // gets to run the AppState listener's own check.
      const suppressed = await isRelockSuppressed();
      if (cancelled) return;

      if (biometricEnabled && !suppressed) {
        // The session is valid but gated behind Face/Touch ID until unlock()
        // succeeds this launch. Location tracking waits for that too --
        // "signed in" should mean the agent is actually using the phone.
        setStatus('locked');
      } else {
        setStatus('signedIn');
        resumeLocationTrackingIfPermitted();
      }
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

  const unlock = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Sentinel',
      cancelLabel: 'Cancel',
      // A device PIN/pattern is an acceptable fallback if biometrics are not
      // enrolled or fail -- the phone's own lock screen already proves this is
      // the agent, so refusing that fallback would only push them to disable
      // the feature entirely.
      disableDeviceFallback: false,
    });
    if (result.success) {
      setStatus('signedIn');
      resumeLocationTrackingIfPermitted();
    }
    return result.success;
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ status, signIn, signOut, unlock }),
    [status, signIn, signOut, unlock],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
