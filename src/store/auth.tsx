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

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { setSessionExpiredHandler } from '../api/client';
import * as api from '../api/endpoints';
import {
  clearTokens,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  setRememberedEmail,
} from '../api/tokens';

type Status = 'restoring' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: Status;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('restoring');

  const signOut = useCallback(async () => {
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
      setStatus('signedIn');
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
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ status, signIn, signOut }),
    [status, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
