/**
 * Haptics, with the failure mode swallowed.
 *
 * Every call is fire-and-forget: a phone with no vibrator (or a user who
 * disabled it) should never see an error because the app tried to buzz.
 * Named for intent, not hardware -- call sites read as "confirm success",
 * not "vibrate at amplitude X".
 */

import * as Haptics from 'expo-haptics';

/** A tap registered. For row presses and toggles. */
export function tap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

/** Something the user cared about completed: message sent, record saved. */
export function success() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => undefined,
  );
}

/** Something needs attention: validation failed, send rejected. */
export function warn() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
    () => undefined,
  );
}
