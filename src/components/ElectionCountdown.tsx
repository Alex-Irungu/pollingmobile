/**
 * Live countdown to the 2027 General Election.
 *
 * Mirrors the web dashboard's banner: counts down to 06:00 on 10 August 2027,
 * the moment polls open -- "3 days left" that flips at midnight would be lying
 * by six hours on the one morning precision matters. Rides the app's single
 * shared ticker (useNow), so it costs nothing extra however many screens
 * show it.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { splitMs, useNow } from '../hooks/useNow';
import { colors, radius, spacing, typography } from '../theme';

/** 10 Aug 2027, 06:00 local time -- when polls open. */
const POLLS_OPEN = new Date(2027, 7, 10, 6, 0, 0).getTime();
/** 17:00 -- when polls close and counting starts. */
const POLLS_CLOSE = new Date(2027, 7, 10, 17, 0, 0).getTime();

const pad2 = (n: number) => String(n).padStart(2, '0');

export function ElectionCountdown() {
  const now = useNow();

  // After election day, the banner quietly disappears.
  if (now >= POLLS_CLOSE) return null;

  const live = now >= POLLS_OPEN;
  const parts = splitMs(POLLS_OPEN - now);

  return (
    <LinearGradient
      colors={[colors.green, colors.greenLight]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.headerRow}>
        <View style={styles.iconBox}>
          <Ionicons name={live ? 'checkbox' : 'time'} size={18} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>
            {live ? 'ELECTION DAY' : 'GENERAL ELECTION · 10 AUG 2027'}
          </Text>
          <Text style={styles.title}>
            {live ? 'Polls are open — good luck out there' : 'Countdown to polls opening'}
          </Text>
        </View>
      </View>

      {!live ? (
        <View style={styles.boxes}>
          {(
            [
              [parts.days, 'DAYS'],
              [parts.hours, 'HRS'],
              [parts.minutes, 'MIN'],
              [parts.seconds, 'SEC'],
            ] as const
          ).map(([value, label]) => (
            <View key={label} style={styles.box}>
              <Text style={styles.boxValue}>
                {label === 'DAYS' ? String(value) : pad2(value)}
              </Text>
              <Text style={styles.boxLabel}>{label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.base,
    gap: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: { ...typography.micro, color: 'rgba(255,255,255,0.75)' },
  title: { ...typography.bodyStrong, fontSize: 14, color: colors.white },
  boxes: { flexDirection: 'row', gap: spacing.sm },
  box: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  boxValue: { ...typography.numeric, fontSize: 22, color: colors.white },
  boxLabel: { ...typography.micro, fontSize: 9, color: 'rgba(255,255,255,0.75)' },
});
