/**
 * Two-phase post-login experience:
 *
 * Phase 1 — "loading": clean full-screen splash with logo and animated
 * progress bar. Nothing else. The bar counts 0-100% over ~2.6 seconds.
 *
 * Phase 2 — "biometric" (only when hardware is available and not yet
 * enabled): the progress section fades out and a bottom sheet slides up
 * asking the agent to enable biometric login for next time. This is a
 * deliberate moment, not an aside mixed into the loading screen.
 *
 * If biometric setup is not needed, onComplete fires as soon as the bar
 * finishes; phase 2 is skipped entirely.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, MIN_TOUCH, radius, spacing, typography } from '../theme';

const PROGRESS_DURATION = 2600;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BAR_H_PAD = spacing.xxl;
const BAR_MAX = SCREEN_WIDTH - BAR_H_PAD * 2;

type Phase = 'loading' | 'biometric';

interface Props {
  onComplete: () => void;
  showBiometricSetup: boolean;
  onEnableBiometric: () => Promise<boolean>;
}

export function PostLoginSplash({ onComplete, showBiometricSetup, onEnableBiometric }: Props) {
  const insets = useSafeAreaInsets();

  // --- Shared animation values -------------------------------------------

  /** Logo + wordmark fade-in */
  const brandOpacity = useSharedValue(0);
  /** Progress section fade-in (and later fade-out) */
  const progressOpacity = useSharedValue(0);
  /** The bar fill itself */
  const barProgress = useSharedValue(0);
  /** Dark scrim that deepens the background when the sheet appears */
  const scrimOpacity = useSharedValue(0);
  /** Bottom-sheet slide-up and fade */
  const sheetTranslateY = useSharedValue(400);
  const sheetOpacity = useSharedValue(0);

  // --- Component state ---------------------------------------------------

  const [displayPct, setDisplayPct] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [biometricBusy, setBiometricBusy] = useState(false);
  const mountedAt = useRef(Date.now());

  // --- Effects -----------------------------------------------------------

  useEffect(() => {
    // ── Phase 1: loading ─────────────────────────────────────────────────
    brandOpacity.value = withTiming(1, { duration: 500 });
    progressOpacity.value = withDelay(350, withTiming(1, { duration: 400 }));
    barProgress.value = withTiming(1, {
      duration: PROGRESS_DURATION,
      easing: Easing.out(Easing.cubic),
    });

    const counter = setInterval(() => {
      const elapsed = Date.now() - mountedAt.current;
      const p = Math.min(100, Math.round((elapsed / PROGRESS_DURATION) * 100));
      setDisplayPct(p);
      if (p >= 100) clearInterval(counter);
    }, 32);

    // ── Phase 1 → 2 (or done) ────────────────────────────────────────────
    const done = setTimeout(() => {
      if (!showBiometricSetup) {
        onComplete();
        return;
      }
      // Fade out progress, bring in the biometric sheet
      progressOpacity.value = withTiming(0, { duration: 280 });
      scrimOpacity.value = withDelay(200, withTiming(0.45, { duration: 380 }));
      sheetOpacity.value = withDelay(260, withTiming(1, { duration: 380 }));
      sheetTranslateY.value = withDelay(260, withTiming(0, {
        duration: 520,
        easing: Easing.out(Easing.back(1.15)),
      }));
      setPhase('biometric');
    }, PROGRESS_DURATION + 350);

    return () => {
      clearInterval(counter);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Animated styles ---------------------------------------------------

  const brandStyle = useAnimatedStyle(() => ({ opacity: brandOpacity.value }));
  const progressSectionStyle = useAnimatedStyle(() => ({ opacity: progressOpacity.value }));
  const barStyle = useAnimatedStyle(() => ({ width: barProgress.value * BAR_MAX }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimOpacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: sheetOpacity.value,
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  // --- Handlers ----------------------------------------------------------

  async function handleEnable() {
    setBiometricBusy(true);
    await onEnableBiometric();
    setBiometricBusy(false);
    onComplete();
  }

  // --- Render ------------------------------------------------------------

  return (
    <View style={styles.root}>

      {/* ── Background gradient ── */}
      <LinearGradient
        colors={[colors.greenDark, colors.green, '#0A5A45']}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* ── Phase 1: brand + wordmark ── */}
      <Animated.View
        style={[styles.brand, brandStyle, { paddingTop: insets.top + spacing.xxxl }]}
      >
        <View style={styles.logoRing}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logo}
            contentFit="contain"
          />
        </View>
        <Text style={styles.wordmark}>Sentinel</Text>
        <Text style={styles.tagline}>FIELD AGENT</Text>
      </Animated.View>

      {/* ── Phase 1: progress bar ── */}
      <Animated.View
        style={[
          styles.progressSection,
          progressSectionStyle,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        pointerEvents="none"
      >
        <View style={styles.progressMeta}>
          <Text style={styles.progressLabel}>Loading your workspace</Text>
          <Text style={styles.percentText}>{displayPct}%</Text>
        </View>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, barStyle]} />
        </View>
      </Animated.View>

      {/* ── Phase 2 scrim: darkens background when sheet appears ── */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}
        pointerEvents="none"
      />

      {/* ── Phase 2: biometric bottom sheet ── */}
      <Animated.View
        style={[styles.sheet, sheetStyle, { paddingBottom: insets.bottom + spacing.xl }]}
        pointerEvents={phase === 'biometric' ? 'auto' : 'none'}
      >
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Icon */}
        <View style={styles.bioIconWrap}>
          <View style={styles.bioIconCircle}>
            <Ionicons name="finger-print" size={44} color={colors.white} />
          </View>
        </View>

        <Text style={styles.sheetTitle}>Sign in faster next time</Text>
        <Text style={styles.sheetBody}>
          Use your fingerprint or face to open Sentinel instantly — no password
          needed on your next login.
        </Text>

        <Pressable
          onPress={handleEnable}
          disabled={biometricBusy}
          style={({ pressed }) => [
            styles.enableBtn,
            pressed && styles.enableBtnPressed,
            biometricBusy && styles.enableBtnBusy,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Enable biometric login"
        >
          {biometricBusy
            ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.enableText}>Enable biometric login</Text>}
        </Pressable>

        <Pressable
          onPress={onComplete}
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

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.greenDark,
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // ── Phase 1 ──
  brand: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  logoRing: {
    width: 108,
    height: 108,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1.5,
    borderColor: 'rgba(189,144,53,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  logo: {
    width: 86,
    height: 86,
  },
  wordmark: {
    fontSize: 40,
    fontWeight: '700' as const,
    color: colors.white,
    letterSpacing: -0.8,
  },
  tagline: {
    ...typography.label,
    color: colors.goldLight,
    letterSpacing: 4,
    marginTop: 2,
  },

  progressSection: {
    width: '100%',
    paddingHorizontal: BAR_H_PAD,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
  },
  progressLabel: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  percentText: {
    ...typography.label,
    color: colors.goldLight,
    fontSize: 13,
  },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: colors.gold,
    elevation: 2,
  },

  // ── Phase 2 ──
  scrim: {
    backgroundColor: colors.greenDark,
  },

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
    // Light shadow to separate sheet from background
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

  bioIconWrap: {
    marginBottom: spacing.lg,
  },
  bioIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: colors.green,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },

  sheetTitle: {
    ...typography.title,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  sheetBody: {
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
  enableBtnPressed: {
    backgroundColor: colors.greenDark,
  },
  enableBtnBusy: {
    opacity: 0.7,
  },
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
