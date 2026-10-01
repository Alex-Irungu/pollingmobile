/**
 * One shared wall clock for every countdown on screen.
 *
 * An events list can show a dozen live countdowns at once, and a dozen
 * independent setIntervals is a dozen un-batched re-renders a second on a
 * cheap phone. One module-level ticker notifies subscribers and
 * useSyncExternalStore hands each component the same `now`, so React commits
 * one batched update per tick. The interval stops entirely when the last
 * subscriber unmounts -- nothing animates on a timer while unseen, per the
 * design constraints in src/theme.
 */

import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let currentNow = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      currentNow = Date.now();
      listeners.forEach((fn) => fn());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => currentNow,
    () => currentNow,
  );
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function splitMs(ms: number): CountdownParts {
  const clamped = Math.max(0, ms);
  const days = Math.floor(clamped / 86_400_000);
  const hours = Math.floor((clamped % 86_400_000) / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  return { days, hours, minutes, seconds };
}
