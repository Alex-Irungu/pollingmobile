/**
 * Field-safety location tracking.
 *
 * This exists for one reason: if an agent goes silent -- held up, in
 * trouble, or just somewhere with no signal for hours -- the command centre
 * needs to know where they were last seen. It is not a results-verification
 * feature and it does not gate anything the agent does; it runs quietly
 * alongside the rest of the app from the moment they sign in.
 *
 * Two layers, both best-effort:
 *  - A background task (expo-task-manager + expo-location) that keeps
 *    reporting every few minutes even while the app is backgrounded, using
 *    Android's foreground-service location mode so the OS does not kill it.
 *  - A foreground ping on app start/resume, so the very first position lands
 *    quickly rather than waiting for the first background tick.
 *
 * Every failure here is swallowed. A missed ping on bad signal is normal and
 * not something the agent should see an error for; the whole feature is
 * best-effort by nature.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { updateMyLocation } from '../api/endpoints';

const LOCATION_TASK = 'sentinel-location-task';

// How often the background task is allowed to report, at minimum. Frequent
// enough that a "last seen" is useful in an emergency, infrequent enough not
// to burn a field phone's battery or data bundle over a 12+ hour election day.
const BACKGROUND_INTERVAL_MS = 5 * 60 * 1000;
const BACKGROUND_DISTANCE_M = 100;

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  const latest = locations?.[locations.length - 1];
  if (!latest) return;

  await updateMyLocation(latest.coords.latitude, latest.coords.longitude).catch(() => undefined);
});

/**
 * Ask for the permissions this feature needs, with the system prompt framed
 * by our own explanation first. Returns whether foreground access was
 * granted -- background is requested too where available, but foreground is
 * the minimum the rest of this module needs to do anything at all.
 */
export async function requestLocationPermissions(): Promise<boolean> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return false;

  // Background is a separate, second prompt on Android 10+ and iOS. Requested
  // right after foreground succeeds, while the agent is still in the flow of
  // granting access, rather than asking again later.
  await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
  return true;
}

export async function hasLocationPermission(): Promise<boolean> {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status === 'granted';
}

let started = false;

/**
 * Start reporting location: one immediate foreground read, then a background
 * task for the rest of the session. Safe to call more than once -- signing in
 * again on an already-tracking device is a no-op.
 */
export async function startLocationTracking(): Promise<void> {
  if (started) return;

  const granted = await hasLocationPermission();
  if (!granted) return;

  started = true;

  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    .then((pos) => updateMyLocation(pos.coords.latitude, pos.coords.longitude))
    .catch(() => undefined);

  const alreadyRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK).catch(
    () => false,
  );
  if (alreadyRunning) return;

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: BACKGROUND_INTERVAL_MS,
    distanceInterval: BACKGROUND_DISTANCE_M,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Sentinel is sharing your location',
      notificationBody: 'The command centre can see your last known position while you are on duty.',
    },
  }).catch(() => {
    started = false;
  });
}

/** Stop reporting. Called on sign-out -- a signed-out device must not keep
 * reporting a position for an agent who is no longer using it. */
export async function stopLocationTracking(): Promise<void> {
  started = false;
  const running = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK).catch(() => false);
  if (running) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
  }
}
