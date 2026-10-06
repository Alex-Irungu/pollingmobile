/**
 * "I have arrived" -- the agent's check-in at their polling station.
 *
 * One tap: read the phone's position, send it, and show the result. The
 * server never turns an agent away for being far from the station (station
 * coordinates are often imprecise); it records the check-in and flags whether
 * the position matched, and this card says so plainly either way. Check-in
 * needs signal -- an agent without it is told to retry, not left guessing.
 */

import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import * as api from '../api/endpoints';
import type { AgentPosting, CheckInInfo } from '../api/types';
import { postingQueryKey } from '../hooks/usePosting';
import * as haptics from '../services/haptics';
import { requestLocationPermissions } from '../services/locationTracking';
import { colors, radius, spacing, typography } from '../theme';
import { Button } from './Button';

const FIX_TIMEOUT_MS = 12_000;

function clock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  const fresh = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
  ]);
  if (fresh) return { lat: fresh.coords.latitude, lng: fresh.coords.longitude };
  const last = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000 });
  return last ? { lat: last.coords.latitude, lng: last.coords.longitude } : null;
}

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export function CheckInCard({ checkIn: cached }: { checkIn: CheckInInfo | null | undefined }) {
  // The posting is cached on disk; yesterday's check-in must not read as today's.
  const checkIn = cached && isToday(cached.checked_in_at) ? cached : null;
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function handleCheckIn() {
    if (busy) return;
    haptics.tap();
    setBusy(true);
    try {
      if (!(await requestLocationPermissions())) {
        Alert.alert(
          'Location needed',
          'Allow location access so the command centre can see you have reached your station.',
        );
        return;
      }
      const position = await currentPosition();
      if (!position) {
        Alert.alert(
          'Could not find you yet',
          'Step outside or near a window for a few seconds, then try again.',
        );
        return;
      }
      const result = await api.checkIn(position.lat, position.lng);
      queryClient.setQueryData<AgentPosting>(postingQueryKey, (old) =>
        old ? { ...old, check_in: result } : old,
      );
      haptics.success();
    } catch {
      haptics.warn();
      Alert.alert(
        'Could not check in',
        'No connection to the server. Try again when you have signal.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (checkIn) {
    const unverified = !checkIn.verified;
    const detail = checkIn.verified
      ? 'Confirmed at your station'
      : checkIn.distance_m !== null
        ? `Recorded, but you were about ${
            checkIn.distance_m >= 1000
              ? `${(checkIn.distance_m / 1000).toFixed(1)} km`
              : `${checkIn.distance_m} m`
          } from the station`
        : 'Recorded. Your station has no location on file to compare';
    return (
      <View style={[styles.card, unverified ? styles.cardWarn : styles.cardOk]}>
        <Ionicons
          name={unverified ? 'alert-circle' : 'checkmark-circle'}
          size={26}
          color={unverified ? colors.pending : colors.verified}
        />
        <View style={styles.flex}>
          <Text style={styles.title}>Checked in at {clock(checkIn.checked_in_at)}</Text>
          <Text style={styles.detail}>{detail}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.flex}>
        <Text style={styles.title}>Have you reached your station?</Text>
        <Text style={styles.detail}>Let the command centre know you are in place.</Text>
      </View>
      <Button
        label={busy ? 'Finding you…' : 'Check in'}
        onPress={handleCheckIn}
        loading={busy}
        disabled={busy}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.base,
  },
  cardOk: { backgroundColor: colors.verifiedSurface, borderColor: colors.verified },
  cardWarn: { backgroundColor: colors.pendingSurface, borderColor: colors.pending },
  title: { ...typography.bodyStrong, color: colors.ink },
  detail: { ...typography.caption, fontSize: 12, color: colors.inkMuted, marginTop: 2 },
});
