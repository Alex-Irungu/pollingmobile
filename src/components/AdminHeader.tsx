/**
 * The admin screens' header band.
 *
 * Same green gradient as the agent app's My Station header, for the same
 * reason: the status bar sits on top of whatever is behind it, and light
 * status icons over a white canvas are invisible. One gradient band under the
 * clock and signal icons fixes that on every admin screen and makes the two
 * halves of the app read as one product.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HIT_SLOP, MIN_TOUCH, colors, radius, spacing, typography } from '../theme';

export function AdminHeader({
  kicker,
  title,
  onBack,
  right,
}: {
  kicker: string;
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={[colors.green, colors.greenLight]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.band, { paddingTop: insets.top + spacing.sm }]}
    >
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={HIT_SLOP}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </Pressable>
        ) : null}
        <View style={styles.titles}>
          <Text style={styles.kicker}>{kicker}</Text>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {right}
      </View>
    </LinearGradient>
  );
}

/** A labelled white-on-green action for the header's right edge. */
export function HeaderAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.action}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={16} color={colors.white} />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  band: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: { flex: 1 },
  kicker: { ...typography.micro, color: 'rgba(255,255,255,0.75)' },
  title: { ...typography.title, fontSize: 22, color: colors.white },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    minHeight: 38,
  },
  actionLabel: { ...typography.label, fontSize: 12, color: colors.white },
});
