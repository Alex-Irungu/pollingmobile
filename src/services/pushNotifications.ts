/**
 * Push notifications: the command centre can reach a phone in a pocket.
 *
 * Until now a message from the command centre was only seen when the agent
 * opened the app -- polling covers the app-open case, but election day is
 * long and phones stay pocketed for hours. This registers the device's Expo
 * push token with the backend, which sends a notification whenever the
 * command centre writes to this agent's thread.
 *
 * Everything is best-effort. An agent who declines the permission still has
 * a fully working app; the pushes are a reach-me-faster channel, not a
 * dependency. No call in this module ever throws.
 */

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import * as api from '../api/endpoints';

// Foreground behaviour: show the banner even while the app is open. The
// agent may be deep in the submit flow; a silent drop means a missed
// instruction from the command centre.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let registered = false;

/**
 * Ask for permission (first run only -- afterwards the OS remembers), fetch
 * this install's Expo push token, and hand it to the backend. Safe to call
 * on every sign-in; re-registering the same token is a no-op server-side.
 */
export async function registerForPushNotifications(): Promise<void> {
  if (registered) return;

  try {
    if (Platform.OS === 'android') {
      // The channel must exist before the first notification arrives, or
      // Android silently drops it. IMPORTANCE_HIGH pops over other apps.
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Command centre messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }
    if (!granted) return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerPushToken(token);
    registered = true;
  } catch {
    // No pushes; the app still polls. Nothing to tell the agent.
  }
}

/**
 * Best-effort deregistration on sign-out, so the next holder of this phone
 * does not receive the previous agent's messages. Must be called while the
 * session is still valid.
 */
export async function unregisterPushNotifications(): Promise<void> {
  try {
    await api.registerPushToken('');
  } catch {
    // The server-side token goes stale instead; Expo drops pushes to
    // uninstalled apps, and a signed-out app shows nothing sensitive.
  }
  registered = false;
}
