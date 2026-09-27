/**
 * Crash and error reporting.
 *
 * We debugged the app-closing-on-launch bug blind, over days, from one phone.
 * Sentry ends that class of suffering: every crash on any agent's phone lands
 * in a dashboard with a stack trace, device model and OS version, within
 * seconds of it happening.
 *
 * The DSN comes from the environment (EXPO_PUBLIC_SENTRY_DSN in .env and in
 * the EAS build profile). Without one, everything here is a silent no-op --
 * the app must never behave differently because monitoring is unconfigured.
 * The DSN is not a secret (it can only submit events, not read them), which
 * is why an EXPO_PUBLIC_ variable is acceptable.
 *
 * Privacy: agents' names and stations are sensitive in a contested election.
 * sendDefaultPii stays off, and nothing here attaches figures, messages or
 * coordinates to an event.
 */

import * as Sentry from '@sentry/react-native';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initMonitoring(): void {
  Sentry.init({
    dsn: DSN,
    enabled: !!DSN,
    sendDefaultPii: false,
    // Errors are the product here; performance tracing on 2G phones is
    // mostly noise and data cost. A small sample keeps a pulse.
    tracesSampleRate: 0.05,
    // Election-day builds are few; knowing exactly which one crashed matters.
    environment: __DEV__ ? 'development' : 'production',
  });
}

/**
 * Report a handled error that should not crash the app but must not vanish
 * either -- queue failures, refused submissions, storage errors.
 */
export function reportError(error: unknown, context?: Record<string, string>): void {
  if (!DSN) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Wrap the root component so navigation/gesture crashes are attributed. */
export const wrapRoot = Sentry.wrap;
