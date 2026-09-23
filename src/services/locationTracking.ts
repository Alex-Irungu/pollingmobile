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
import { AppState, PermissionsAndroid, Platform } from 'react-native';

import { updateMyLocation } from '../api/endpoints';
import { withRelockSuppressed } from './appStateGuard';

/**
 * Android 13+ (API 33) requires a runtime permission before any notification
 * can be posted, including the one a location foreground service must show.
 * Skipping this does not always fail quietly -- on some OEM builds, starting
 * the foreground service without it throws past the JS promise boundary and
 * takes the whole app down with it, which is why this must be requested (and
 * awaited) before startLocationUpdatesAsync, not left to the OS to sort out.
 */
async function ensureNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android' || Platform.Version < 33) return;
  await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  ).catch(() => undefined);
}

/**
 * Android 12+ refuses to start a foreground service (or kills the app trying)
 * when the app is not actually in the foreground at that exact moment. This
 * module is invoked right after login, unawaited, so it can lose the race
 * against something else that briefly backgrounds the app in that same
 * window -- the permission dialogs this module's own request triggers, or the
 * agent jumping straight to the camera. That race is what took the app down
 * rather than the try/catch below catching it. Waiting for 'active' here
 * removes the race instead of trying to survive it.
 */
function waitForForeground(): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        subscription.remove();
        resolve();
      }
    });
  });
}

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
  // The system permission dialog itself briefly takes focus away from the
  // app, which otherwise looks identical to the agent switching away to
  // another app and would wrongly trigger the biometric re-lock (see
  // appStateGuard.ts).
  return withRelockSuppressed(async () => {
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (foreground.status !== 'granted') return false;

    // Background is a separate, second prompt on Android 10+ and iOS. Requested
    // right after foreground succeeds, while the agent is still in the flow of
    // granting access, rather than asking again later.
    await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
    return true;
  });
}

export async function hasLocationPermission(): Promise<boolean> {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status === 'granted';
}

let started = false;

/** Serialises starts, so two callers cannot race into one another. */
let startInFlight: Promise<void> | null = null;

/**
 * Whether the foreground service has already been stopped in this runtime.
 *
 * Android tears a location foreground service down asynchronously: the promise
 * from stopLocationUpdatesAsync resolves well before the service, its
 * notification and its task registration are actually gone. Starting a second
 * service inside that window throws *natively* -- past the try/catch below,
 * taking the whole app down rather than logging an error. That is the
 * sign-out-then-straight-back-in crash.
 *
 * Rather than guess how long the teardown takes, the service is simply never
 * started twice in one runtime. In the normal case this costs nothing: signing
 * out restarts the runtime (see services/restart.ts), so the next sign-in gets
 * a fresh one and a fresh service. This flag only bites where the restart is
 * unavailable (Expo Go, dev client), and there the agent still gets the
 * immediate foreground position read below -- only the background task waits
 * until the next real app launch. A missing background ping is a degraded
 * feature; a closed app in the middle of a shift is not.
 */
let stoppedThisRuntime = false;

/**
 * Start reporting location: one immediate foreground read, then a background
 * task for the rest of the session. Safe to call more than once -- signing in
 * again on an already-tracking device is a no-op.
 */
export async function startLocationTracking(): Promise<void> {
  if (started) return;
  if (startInFlight) return startInFlight;

  startInFlight = start().finally(() => {
    startInFlight = null;
  });
  return startInFlight;
}

async function start(): Promise<void> {
  const granted = await hasLocationPermission();
  if (!granted) return;

  started = true;

  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    .then((pos) => updateMyLocation(pos.coords.latitude, pos.coords.longitude))
    .catch(() => undefined);

  // Wrapped in try/catch rather than relying on a chained .catch(): the
  // foreground service this starts posts a system notification, and on some
  // Android builds a missing notification permission surfaces as a native
  // exception that a chained promise .catch() does not reliably absorb. This
  // whole feature is best-effort -- it must never be able to take the app
  // down with it.
  try {
    await withRelockSuppressed(ensureNotificationPermission);

    const alreadyRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK).catch(
      () => false,
    );
    if (alreadyRunning) return;

    // See stoppedThisRuntime: never ask Android for a second foreground
    // service in a runtime that has already torn one down.
    if (stoppedThisRuntime) return;

    // See waitForForeground's note above: never attempt to start the
    // foreground service while something else (a permission dialog, the
    // camera) has taken the app out of the foreground.
    await waitForForeground();

    // Re-checked after the wait, which can last as long as the agent spends in
    // another app: a sign-out may have happened in the meantime.
    if (!started || stoppedThisRuntime) return;

    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: BACKGROUND_INTERVAL_MS,
      distanceInterval: BACKGROUND_DISTANCE_M,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Sentinel is sharing your location',
        notificationBody: 'The command centre can see your last known position while you are on duty.',
      },
    });
  } catch {
    started = false;
  }
}

/** Stop reporting. Called on sign-out -- a signed-out device must not keep
 * reporting a position for an agent who is no longer using it. */
export async function stopLocationTracking(): Promise<void> {
  started = false;
  stoppedThisRuntime = true;
  const running = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK).catch(() => false);
  if (running) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
  }
}
