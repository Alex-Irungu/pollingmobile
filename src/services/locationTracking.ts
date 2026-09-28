/**
 * Field-safety location tracking.
 *
 * This exists for one reason: if an agent goes silent -- held up, in
 * trouble, or just somewhere with no signal for hours -- the command centre
 * needs to know where they were last seen. It is not a results-verification
 * feature and it does not gate anything the agent does; it runs quietly
 * alongside the rest of the app from the moment they sign in.
 *
 * Foreground-only, by decision, not oversight. Earlier versions ran an
 * Android location foreground service (expo-task-manager + expo-location) so
 * reporting continued while the app was backgrounded. That service is the
 * only part of this app that can throw *natively* -- past every JS
 * try/catch -- and close it: starting while not foregrounded (Android 12+),
 * starting while a previous instance is still tearing down, starting without
 * the notification permission on some OEM builds. Five separate fixes fenced
 * in five of its failure modes and agents' phones kept finding a sixth. The
 * service is gone because this module's own rule decides the trade: a
 * missing background ping is a degraded feature; a closed app in the middle
 * of a shift is not.
 *
 * What remains: a ping at sign-in, then one every few minutes while the app
 * is open, and one on each return to it. "Last seen" stops updating while
 * the app is backgrounded -- acceptable for a feature whose purpose is the
 * approximate position of an agent who has gone silent.
 *
 * Every failure here is swallowed. A missed ping on bad signal is normal and
 * not something the agent should see an error for; the whole feature is
 * best-effort by nature.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';

import { updateMyLocation } from '../api/endpoints';
import { withRelockSuppressed } from './appStateGuard';

/**
 * The background task older versions registered. Defined as a no-op so a
 * still-registered task from a previous install has something to invoke
 * instead of a "task not found" error, and stopped on the first start or
 * stop in this version. New installs never register it.
 */
const LEGACY_LOCATION_TASK = 'sentinel-location-task';

TaskManager.defineTask(LEGACY_LOCATION_TASK, async () => undefined);

async function stopLegacyBackgroundTask(): Promise<void> {
  try {
    const running = await TaskManager.isTaskRegisteredAsync(LEGACY_LOCATION_TASK);
    if (running) await Location.stopLocationUpdatesAsync(LEGACY_LOCATION_TASK);
  } catch {
    // Best-effort: an unstopped legacy task reports harmlessly into the no-op.
  }
}

// Frequent enough that a "last seen" is useful in an emergency, infrequent
// enough not to burn a field phone's battery or data bundle over a 12+ hour
// election day.
const REPORT_INTERVAL_MS = 5 * 60 * 1000;

// A resume ping is skipped when a report landed this recently, so an agent
// flicking between the app and the camera does not fire one per flick.
const MIN_REPORT_GAP_MS = 60 * 1000;

/**
 * Ask for foreground location access. Returns whether it was granted.
 */
export async function requestLocationPermissions(): Promise<boolean> {
  // The system permission dialog itself briefly takes focus away from the
  // app, which otherwise looks identical to the agent switching away to
  // another app and would wrongly trigger the biometric re-lock (see
  // appStateGuard.ts).
  //
  // Foreground only. Background permission belonged to the foreground
  // service, and on Android 11+ requesting it bounces the agent out to a
  // Settings page -- a jarring detour for a permission nothing here uses
  // any more.
  return withRelockSuppressed(async () => {
    const foreground = await Location.requestForegroundPermissionsAsync();
    return foreground.status === 'granted';
  });
}

export async function hasLocationPermission(): Promise<boolean> {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status === 'granted';
}

/**
 * Start tracking if permitted, asking first if permission has never been
 * requested on this install.
 *
 * The original design only prompted at password sign-in -- but an agent who
 * updates the app over a live session, or who signs in by fingerprint, never
 * passes through that moment, and their permission stays "undetermined"
 * forever: no prompt, no pings, invisible on the command-centre map. So an
 * undetermined status is treated as "the ask moment never happened" and this
 * launch becomes it. A real denial is still respected -- never re-prompted.
 */
export async function ensureLocationTracking(): Promise<void> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status === 'granted') {
    await startLocationTracking();
    return;
  }
  if (status === 'undetermined') {
    const granted = await requestLocationPermissions();
    if (granted) await startLocationTracking();
  }
}

let started = false;
let reportTimer: ReturnType<typeof setInterval> | null = null;
let resumeSubscription: { remove: () => void } | null = null;
let lastReportAt = 0;
let reportInFlight = false;

async function reportPosition(): Promise<void> {
  if (reportInFlight) return;
  reportInFlight = true;
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    await updateMyLocation(position.coords.latitude, position.coords.longitude);
    lastReportAt = Date.now();
  } catch {
    // Offline, GPS off, or the fix timed out: normal in the field, try again
    // on the next tick.
  } finally {
    reportInFlight = false;
  }
}

/**
 * Start reporting location: one immediate read, then one every few minutes
 * while the app is in the foreground, plus one on each return to it. Safe to
 * call more than once -- signing in again on an already-tracking device is a
 * no-op.
 */
export async function startLocationTracking(): Promise<void> {
  if (started) return;

  const granted = await hasLocationPermission();
  if (!granted) return;

  started = true;

  void stopLegacyBackgroundTask();
  void reportPosition();

  reportTimer = setInterval(() => {
    if (started && AppState.currentState === 'active') void reportPosition();
  }, REPORT_INTERVAL_MS);

  resumeSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active' && started && Date.now() - lastReportAt > MIN_REPORT_GAP_MS) {
      void reportPosition();
    }
  });
}

/** Stop reporting. Called on sign-out -- a signed-out device must not keep
 * reporting a position for an agent who is no longer using it. */
export async function stopLocationTracking(): Promise<void> {
  started = false;
  if (reportTimer) {
    clearInterval(reportTimer);
    reportTimer = null;
  }
  if (resumeSubscription) {
    resumeSubscription.remove();
    resumeSubscription = null;
  }
  await stopLegacyBackgroundTask();
}
