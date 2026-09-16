/**
 * Shown when the session is valid but gated behind biometrics (see
 * src/store/auth.tsx's 'locked' status). Deliberately not the login form --
 * the refresh token is still good, so this is a quick re-entry gate, not a
 * fresh sign-in.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../store/auth';
import { MIN_TOUCH, colors, radius, spacing, typography } from '../theme';

export function LockScreen() {
  const insets = useSafeAreaInsets();
  const { unlock, signOut } = useAuth();
  const [failed, setFailed] = useState(false);

  const attempt = useCallback(async () => {
    setFailed(false);
    const success = await unlock();
    if (!success) setFailed(true);
  }, [unlock]);

  useEffect(() => {
    // Prompt immediately on arrival, so the agent is not left staring at a
    // button they already know they need to press.
    attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.greenDark, colors.green, colors.greenLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.content, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}>
        <Animated.View entering={FadeInDown.duration(420)} style={styles.iconWrap}>
          <Ionicons name="finger-print" size={44} color={colors.gold} />
        </Animated.View>

        <Animated.Text entering={FadeInDown.delay(80).duration(420)} style={styles.title}>
          Sentinel is locked
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(140).duration(420)} style={styles.subtitle}>
          Unlock with your fingerprint or face to continue.
        </Animated.Text>

        {failed ? (
          <Animated.Text entering={FadeIn} style={styles.error}>
            Could not verify. Try again.
          </Animated.Text>
        ) : null}

        <Pressable
          onPress={attempt}
          style={({ pressed }) => [styles.unlockButton, pressed && styles.unlockButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Unlock"
        >
          <Ionicons name="lock-open-outline" size={18} color={colors.white} />
          <Text style={styles.unlockText}>Try again</Text>
        </Pressable>

        <Pressable onPress={signOut} style={styles.signOutLink} accessibilityRole="button">
          <Text style={styles.signOutText}>Sign out instead</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.green },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(189,144,53,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { ...typography.title, color: colors.white, textAlign: 'center' },
  subtitle: {
    ...typography.body,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  error: {
    ...typography.caption,
    color: colors.goldLight,
    marginTop: spacing.base,
    textAlign: 'center',
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH + 4,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    marginTop: spacing.xxl,
  },
  unlockButtonPressed: { backgroundColor: 'rgba(255,255,255,0.22)' },
  unlockText: { ...typography.bodyStrong, color: colors.white },
  signOutLink: { marginTop: spacing.lg, padding: spacing.sm },
  signOutText: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.75)',
    textDecorationLine: 'underline',
  },
});
