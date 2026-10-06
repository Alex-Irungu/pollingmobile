/**
 * Live panic alerts for the command-centre dashboard.
 *
 * Renders nothing when all is quiet. When an agent has pressed the panic
 * button it becomes the loudest thing on the screen: who, where, how long
 * they have been waiting, and the one button that moves the response to its
 * next step. The call and map buttons are there because the first thing
 * anyone does with an emergency is phone the person and find them.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { EmergencyAlert } from '../api/types';
import { useEmergencies, useEmergencyStatus } from '../hooks/useEmergencies';
import { useNow } from '../hooks/useNow';
import * as haptics from '../services/haptics';
import { HIT_SLOP, MIN_TOUCH, colors, radius, spacing, typography } from '../theme';
import { pressedStyle } from './ui';

const NEXT_STEP = {
  OPEN: { to: 'ACKNOWLEDGED', label: 'Acknowledge' },
  ACKNOWLEDGED: { to: 'DISPATCHED', label: 'Dispatch help' },
  DISPATCHED: { to: 'RESOLVED', label: 'Mark resolved' },
} as const;

function waiting(createdAt: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

function EmergencyCard({ alert }: { alert: EmergencyAlert }) {
  const router = useRouter();
  const now = useNow();
  const update = useEmergencyStatus();

  const step = alert.status === 'RESOLVED' ? null : NEXT_STEP[alert.status];
  const busy = update.isPending && update.variables?.id === alert.id;

  function advance() {
    if (!step) return;
    haptics.tap();
    const run = () => update.mutate({ id: alert.id, status: step.to });
    if (step.to === 'RESOLVED') {
      Alert.alert(
        'Mark as resolved?',
        `${alert.agent_name} will be told the emergency is over.`,
        [
          { text: 'Not yet', style: 'cancel' },
          { text: 'Resolve', onPress: run },
        ],
      );
      return;
    }
    run();
  }

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.sirenDot}>
          <Ionicons name="warning" size={18} color={colors.white} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>
            {alert.agent_name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {alert.polling_station ?? 'Station unknown'} · {waiting(alert.created_at, now)}
          </Text>
        </View>
        <View style={[styles.chip, alert.status !== 'OPEN' && styles.chipHandled]}>
          <Text style={[styles.chipText, alert.status !== 'OPEN' && styles.chipTextHandled]}>
            {alert.status_display.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {alert.agent_phone ? (
          <Pressable
            style={pressedStyle(styles.iconButton)}
            onPress={() => Linking.openURL(`tel:${alert.agent_phone}`).catch(() => undefined)}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={`Call ${alert.agent_name}`}
          >
            <Ionicons name="call" size={18} color={colors.rejected} />
            <Text style={styles.iconButtonText}>Call</Text>
          </Pressable>
        ) : null}
        {alert.map_url ? (
          <Pressable
            style={pressedStyle(styles.iconButton)}
            onPress={() => Linking.openURL(alert.map_url as string).catch(() => undefined)}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Open location in maps"
          >
            <Ionicons name="location" size={18} color={colors.rejected} />
            <Text style={styles.iconButtonText}>Map</Text>
          </Pressable>
        ) : (
          <View style={styles.noLocation}>
            <Text style={styles.noLocationText}>No location</Text>
          </View>
        )}
        <Pressable
          style={pressedStyle(styles.iconButton)}
          onPress={() => router.navigate('/(app)/inbox')}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Open the chat"
        >
          <Ionicons name="chatbubble" size={18} color={colors.rejected} />
          <Text style={styles.iconButtonText}>Chat</Text>
        </Pressable>
      </View>

      {step ? (
        <Pressable
          style={pressedStyle(styles.primary, busy && styles.primaryBusy)}
          onPress={advance}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={step.label}
        >
          <Text style={styles.primaryText}>{busy ? 'Updating…' : step.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmergencyPanel() {
  const { emergencies } = useEmergencies();
  if (emergencies.length === 0) return null;

  return (
    <View style={styles.wrap} accessibilityLiveRegion="assertive">
      <Text style={styles.heading}>
        {emergencies.length === 1 ? '1 ACTIVE EMERGENCY' : `${emergencies.length} ACTIVE EMERGENCIES`}
      </Text>
      {emergencies.map((alert) => (
        <EmergencyCard key={alert.id} alert={alert} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: spacing.sm },
  heading: { ...typography.micro, color: colors.rejected, letterSpacing: 1, fontSize: 11 },
  card: {
    backgroundColor: colors.rejectedSurface,
    borderColor: colors.rejected,
    borderWidth: 2,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sirenDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.rejected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...typography.bodyStrong, color: colors.ink },
  meta: { ...typography.caption, fontSize: 12, color: colors.inkMuted },
  chip: {
    backgroundColor: colors.rejected,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  chipHandled: { backgroundColor: colors.pendingSurface },
  chipText: { ...typography.micro, fontSize: 9, color: colors.white, letterSpacing: 0.5 },
  chipTextHandled: { color: colors.pending },
  actions: { flexDirection: 'row', gap: spacing.sm },
  iconButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: MIN_TOUCH,
    backgroundColor: colors.surface,
    borderColor: colors.rejected,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  iconButtonText: { ...typography.label, fontSize: 13, color: colors.rejected },
  noLocation: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH,
  },
  noLocationText: { ...typography.caption, fontSize: 12, color: colors.inkFaint },
  primary: {
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.rejected,
    borderRadius: radius.md,
  },
  primaryBusy: { opacity: 0.6 },
  primaryText: { ...typography.bodyStrong, color: colors.white },
});
