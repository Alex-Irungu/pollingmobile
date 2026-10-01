/**
 * Who is signed in, and therefore which navigator this phone renders.
 *
 * The role is cached in AsyncStorage so that an admin who opens the app in a
 * dead spot still lands on the admin tabs instead of a spinner -- the same
 * offline-first choice the session restore makes. The network copy wins the
 * moment it arrives, so a phone that changes hands corrects itself on the
 * first successful /auth/me/.
 *
 * This is presentation only. Every admin endpoint independently rejects an
 * agent token, so the worst a stale cached role can do is render tabs whose
 * every request 403s.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import * as api from '../api/endpoints';

const ROLE_CACHE_KEY = 'sentinel.cachedRole';

/** Roles that get the admin navigator. Mirrors the backend's command-centre
 * set; anything unknown falls back to the agent experience, which is the
 * safe default for a vocabulary that can grow. */
const ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'CAMPAIGN_ADMIN',
  'COMMAND_CENTER_ADMIN',
  'COORDINATOR',
  'INCIDENT_MANAGER',
  'TALLY_MANAGER',
]);

export function isAdminRole(role: string | null): boolean {
  return !!role && ADMIN_ROLES.has(role);
}

export const meQueryKey = ['me'] as const;

export function useMe(): {
  role: string | null;
  isAdmin: boolean;
  fullName: string | null;
  /** True only while neither the cache nor the network has answered yet. */
  resolving: boolean;
} {
  // undefined = still reading the cache; null = cache is empty.
  const [cachedRole, setCachedRole] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(ROLE_CACHE_KEY)
      .then((value) => setCachedRole(value))
      .catch(() => setCachedRole(null));
  }, []);

  const query = useQuery({
    queryKey: meQueryKey,
    queryFn: api.fetchMe,
    staleTime: 10 * 60_000,
  });

  useEffect(() => {
    if (query.data?.role) {
      void AsyncStorage.setItem(ROLE_CACHE_KEY, query.data.role).catch(
        () => undefined,
      );
    }
  }, [query.data?.role]);

  const role = query.data?.role ?? (cachedRole === undefined ? null : cachedRole);
  const resolving = cachedRole === undefined && query.isPending;

  return {
    role,
    isAdmin: isAdminRole(role),
    fullName: query.data?.full_name ?? null,
    resolving,
  };
}
