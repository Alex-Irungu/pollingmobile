/**
 * Hold-to-activate emergency button.
 *
 * Hold, not tap, because a false alarm sends the command centre scrambling
 * and erodes trust in real ones -- but there is deliberately no confirmation
 * dialog after the hold, because a person in trouble does not have a second
 * tap to spare. The hold *is* the confirmation: a long press with haptic
 * feedback at the moment it fires.
 *
 * Sits on My Station because that is the screen the app opens to; in a bad
 * moment nobody is navigating tabs.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getEmergencyStatus,
  resetEmergencyStatus,
  sendEmergencyAlert,
  subscribeEmergency,
  type EmergencyStatus,
} from '../services/emergency';
import { colors, radius, spacing, typography } from '../theme';

const HOLD_MS = 1500;

interface Props {
  stationDisplayName: string | null;
  stationIebcCode: string | null;
}

export function PanicButton({ stationDisplayName, stationIebcCode }: Props) {
  const [status, setStatus] = useState<EmergencyStatus>(getEmergencyStatus());

  useEffect(() => subscribeEmergency(setStatus), []);

  // Let a "sent" state rest on screen long enough to be believed, then
  // return the button to ready -- an emergency can happen twice in one day.
  useEffect(() => {
    if (status !== 'sent') return;
    const timer = setTimeout(() => resetEmergencyStatus(), 60_000);
    return () => clearTimeout(timer);
  }, [status]);

  function activate() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
      () => undefined,
    );
    void sendEmergencyAlert({
      displayName: stationDisplayName,
      iebcCode: stationIebcCode,
    });
  }

  if (status === 'sent') {
    return (
      <View style={[styles.container, styles.sentContainer]}>
        <Ionicons name="checkmark-circle" size={20} color={colors.verified} />
        <View style={styles.flex}>
          <Text style={styles.sentTitle}>Alert sent</Text>
          <Text style={styles.subText}>
            The command centre has your alert and location. Keep your phone
            with you; they will reach out.
          </Text>
        </View>
      </View>
    );
  }

  if (status === 'sending') {
    return (
      <View style={[styles.container, styles.sendingContainer]}>
        <Ionicons name="radio-outline" size={20} color={colors.rejected} />
        <View style={styles.flex}>
          <Text style={styles.sendingTitle}>Sending alert…</Text>
          <Text style={styles.subText}>
            Keeps retrying by itself, even on weak signal. You do not need to
            do anything.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      <Pressable
        onLongPress={activate}
        delayLongPress={HOLD_MS}
        style={({ pressed }) => [
          styles.container,
          styles.idleContainer,
          pressed && styles.idlePressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Emergency. Press and hold to alert the command centre with your location."
      >
        <View style={styles.iconWrap}>
          <Ionicons name="warning" size={18} color={colors.white} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.idleTitle}>Emergency</Text>
          <Text style={[styles.subText, styles.idleSubText]}>
            Press and hold to send your location to the command centre
          </Text>
        </View>
      </Pressable>
      {status === 'failed' ? (
        <Text style={styles.failedText}>
          The alert could not be sent. Hold the button to try again — and if
          you can, call the command centre directly.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  idleContainer: {
    backgroundColor: colors.rejected,
    borderColor: colors.rejected,
  },
  idlePressed: {
    backgroundColor: '#8F1E17',
    borderColor: '#8F1E17',
  },
  sendingContainer: {
    backgroundColor: colors.rejectedSurface,
    borderColor: colors.rejected,
  },
  sentContainer: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  idleTitle: { ...typography.bodyStrong, color: colors.white },
  idleSubText: { color: 'rgba(255,255,255,0.85)' },
  sendingTitle: { ...typography.bodyStrong, color: colors.rejected },
  sentTitle: { ...typography.bodyStrong, color: colors.verified },
  subText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: 1,
    lineHeight: 16,
  },
  failedText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.rejected,
    marginTop: spacing.sm,
    lineHeight: 16,
  },
});
