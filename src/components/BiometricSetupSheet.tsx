/**
 * One-time offer to turn on fingerprint sign-in.
 *
 * This replaces a full-screen post-login splash that ran a fake 2.2-second
 * progress bar before the agent could reach anything. The bar measured
 * nothing -- it was a timer -- so it added two seconds to every single sign-in
 * to look busy. An agent signing in at a polling station wants their station
 * details, not a loading animation.
 *
 * So the app navigates immediately and this sheet slides up over the live
 * screen behind it. It is dismissible, it is asked at most once (see
 * setBiometricOfferDeclined), and dismissing it leaves the agent exactly where
 * they already are.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, MIN_TOUCH, radius, spacing, typography } from '../theme';

interface Props {
  /** Runs the system prompt and stores the credential. Resolves to success. */
  onEnable: () => Promise<boolean>;
  /** Dismissed, either by enabling or by declining. */
  onDismiss: (declined: boolean) => void;
}

export function BiometricSetupSheet({ onEnable, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  async function handleEnable() {
    if (busy) return;
    setBusy(true);
    await onEnable();
    setBusy(false);
    // Dismissed either way: a failed or cancelled system prompt is the agent
    // saying no for now, and re-presenting the sheet would trap them.
    onDismiss(false);
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        entering={FadeIn.duration(220)}
        style={[StyleSheet.absoluteFill, styles.scrim]}
        pointerEvents="none"
      />

      <Animated.View
        entering={SlideInDown.duration(420).easing(Easing.out(Easing.cubic))}
        style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        <View style={styles.handle} />

        <View style={styles.iconCircle}>
          <Ionicons name="finger-print" size={40} color={colors.white} />
        </View>

        <Text style={styles.title}>Sign in faster next time</Text>
        <Text style={styles.body}>
          Use your fingerprint to open Sentinel instantly — no password needed
          on your next login.
        </Text>

        <Pressable
          onPress={handleEnable}
          disabled={busy}
          style={({ pressed }) => [
            styles.enableBtn,
            pressed && styles.enableBtnPressed,
            busy && styles.enableBtnBusy,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Enable fingerprint login"
        >
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.enableText}>Enable fingerprint login</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => onDismiss(true)}
          disabled={busy}
          style={styles.skipBtn}
          accessibilityRole="button"
          accessibilityLabel="Not now"
        >
          <Text style={styles.skipText}>Not now</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(1, 26, 20, 0.5)' },

  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F5F7F6',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginBottom: spacing.xl,
  },

  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    elevation: 4,
    shadowColor: colors.green,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },

  title: {
    ...typography.title,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    ...typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xxl,
  },

  enableBtn: {
    width: '100%',
    backgroundColor: colors.green,
    borderRadius: radius.lg,
    minHeight: MIN_TOUCH + 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    elevation: 2,
  },
  enableBtnPressed: { backgroundColor: colors.greenDark },
  enableBtnBusy: { opacity: 0.7 },
  enableText: {
    ...typography.bodyStrong,
    color: colors.white,
    fontSize: 16,
  },

  skipBtn: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  skipText: {
    ...typography.body,
    color: colors.inkMuted,
  },
});
