/**
 * The agent's posting: station, race and ballot.
 *
 * Persisted to disk, because this is the data an agent needs at the moment they
 * are least likely to have signal. It is fetched in the morning and then served
 * from cache for the rest of the day.
 *
 * React Query's cache is in-memory and dies with the process, so it is mirrored
 * to AsyncStorage. An agent who force-closes the app in a dead spot still opens
 * it to their station details rather than a spinner and an error.
 *
 * Only operational reference data is written here -- station name, ballot,
 * voter-roll count. No credential touches this file; tokens live in the OS
 * keystore.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import * as api from '../api/endpoints';
import type { AgentPosting } from '../api/types';

const CACHE_KEY = 'sentinel.posting';

export const postingQueryKey = ['posting'] as const;

async function readCache(): Promise<AgentPosting | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as AgentPosting) : null;
  } catch {
    return null;
  }
}

export function clearPostingCache(): Promise<void> {
  return AsyncStorage.removeItem(CACHE_KEY).catch(() => undefined);
}

export function usePosting() {
  const queryClient = useQueryClient();

  // Seed the query cache from disk once, before the first fetch resolves. Only
  // fills an empty cache, so a fresh response is never overwritten by a stale
  // one if the network wins the race.
  useEffect(() => {
    let cancelled = false;

    readCache().then((cached) => {
      if (cancelled || !cached) return;
      if (queryClient.getQueryData(postingQueryKey) === undefined) {
        queryClient.setQueryData(postingQueryKey, cached);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  const query = useQuery({
    queryKey: postingQueryKey,
    queryFn: api.fetchPosting,
    // The posting changes only if an admin reassigns the agent, so it does not
    // need re-fetching on every screen focus -- but it must not be pinned
    // forever either.
    staleTime: 5 * 60 * 1000,
  });

  // Mirror every successful response to disk.
  useEffect(() => {
    if (query.data) {
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(query.data)).catch(
        () => undefined,
      );
    }
  }, [query.data]);

  return query;
}
