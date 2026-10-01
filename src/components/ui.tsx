/**
 * Small shared UI primitives.
 *
 * Grouped in one file rather than split across a dozen modules: each is a few
 * lines, and they are almost always imported together.
 */

import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import {
  HIT_SLOP,
  colors,
  radius,
  shadow,
  spacing,
  typography,
} from '../theme';
import type { SubmissionStatus } from '../api/types';

// --------------------------------------------------------------------------- //
// Card
// --------------------------------------------------------------------------- //

export function Card({
  children,
  style,
  /** Stagger index, so a list of cards animates in sequence. */
  index = 0,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  index?: number;
}) {
  return (
    <Animated.View
      // 60ms per item, capped: beyond ~5 items the stagger stops reading as
      // intentional and starts feeling slow.
      entering={FadeInDown.delay(Math.min(index, 5) * 60).duration(260)}
      style={[styles.card, style]}
    >
      {children}
    </Animated.View>
  );
}

// --------------------------------------------------------------------------- //
// Section label
// --------------------------------------------------------------------------- //

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{String(children).toUpperCase()}</Text>;
}

// --------------------------------------------------------------------------- //
// Key/value row
// --------------------------------------------------------------------------- //

export function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | number | null | undefined;
  /** Tabular digits, for codes and figures that get compared by eye. */
  mono?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[styles.detailValue, mono && styles.detailValueMono]}
        numberOfLines={2}
      >
        {value === null || value === undefined || value === '' ? '--' : String(value)}
      </Text>
    </View>
  );
}

// --------------------------------------------------------------------------- //
// Status pill
// --------------------------------------------------------------------------- //

const STATUS_STYLE: Record<string, { label: string; fg: string; bg: string }> = {
  // "Sent" and "Awaiting review" rather than the raw enum: they tell the agent
  // someone else now has it, which is the thing they actually want to know.
  SUBMITTED: { label: 'Sent', fg: colors.info, bg: colors.infoSurface },
  PENDING: { label: 'Awaiting review', fg: colors.pending, bg: colors.pendingSurface },
  VERIFIED: { label: 'Verified', fg: colors.verified, bg: colors.verifiedSurface },
  FLAGGED: { label: 'Flagged', fg: colors.flagged, bg: colors.flaggedSurface },
  REJECTED: { label: 'Rejected', fg: colors.rejected, bg: colors.rejectedSurface },
};

/**
 * Turn an unrecognised status into something readable.
 *
 * "AWAITING_REVIEW" becomes "Awaiting review". Necessary because the backend's
 * status vocabulary has changed once already and installed apps cannot be
 * updated mid-election, so an unknown value must still render sensibly.
 */
function humanise(status: string): string {
  const words = status.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function StatusPill({ status }: { status: SubmissionStatus }) {
  const known = STATUS_STYLE[status];
  const style = known ?? {
    label: humanise(status),
    fg: colors.inkMuted,
    bg: colors.surfaceAlt,
  };
  return (
    <View style={[styles.pill, { backgroundColor: style.bg }]}>
      <View style={[styles.pillDot, { backgroundColor: style.fg }]} />
      <Text style={[styles.pillText, { color: style.fg }]}>{style.label}</Text>
    </View>
  );
}

// --------------------------------------------------------------------------- //
// Banner
// --------------------------------------------------------------------------- //

type BannerTone = 'info' | 'warning' | 'error' | 'success';

const BANNER_STYLE: Record<BannerTone, { fg: string; bg: string }> = {
  info: { fg: colors.info, bg: colors.infoSurface },
  warning: { fg: colors.flagged, bg: colors.flaggedSurface },
  error: { fg: colors.rejected, bg: colors.rejectedSurface },
  success: { fg: colors.verified, bg: colors.verifiedSurface },
};

export function Banner({
  tone = 'info',
  title,
  message,
  action,
}: {
  tone?: BannerTone;
  title?: string;
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  const style = BANNER_STYLE[tone];
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={[styles.banner, { backgroundColor: style.bg }]}
      accessibilityRole="alert"
    >
      <View style={[styles.bannerBar, { backgroundColor: style.fg }]} />
      <View style={styles.bannerBody}>
        {title ? (
          <Text style={[styles.bannerTitle, { color: style.fg }]}>{title}</Text>
        ) : null}
        <Text style={styles.bannerMessage}>{message}</Text>
        {action ? (
          <Pressable
            onPress={action.onPress}
            hitSlop={HIT_SLOP}
            style={styles.bannerAction}
          >
            <Text style={[styles.bannerActionText, { color: style.fg }]}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

// --------------------------------------------------------------------------- //
// Loading / empty states
// --------------------------------------------------------------------------- //

export function LoadingState({
  message = 'Loading',
  subMessage,
}: {
  message?: string;
  subMessage?: string;
}) {
  return (
    <View style={styles.centred}>
      <ActivityIndicator color={colors.green} size="large" />
      <Text style={styles.centredText}>{message}</Text>
      {subMessage ? (
        <Text style={[styles.centredText, { fontSize: 12, marginTop: 6, opacity: 0.6, maxWidth: 280, textAlign: 'center' }]}>
          {subMessage}
        </Text>
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  icon,
  action,
}: {
  title: string;
  message: string;
  icon?: React.ReactNode;
  /** The fix, right where the problem is stated — not a hint to go find it. */
  action?: { label: string; onPress: () => void };
}) {
  return (
    <Animated.View entering={FadeIn.duration(260)} style={styles.centred}>
      {icon ? <View style={styles.emptyIcon}>{icon}</View> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.centredText}>{message}</Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          style={pressedStyle(styles.emptyAction)}
          accessibilityRole="button"
        >
          <Text style={styles.emptyActionText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

// --------------------------------------------------------------------------- //
// Skeletons
// --------------------------------------------------------------------------- //

/** One pulsing grey block, shaped by the caller. The pulse runs on the UI
 * thread, so it stays smooth while the JS thread parses the real response. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const pulse = useSharedValue(0.45);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [pulse]);

  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return <Animated.View style={[styles.skeleton, animated, style]} />;
}

/** A column of card-shaped placeholders, matching the lists they stand in
 * for. Perceived speed: the screen's shape arrives before its data. */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <View style={styles.skeletonList}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.skeletonCard}>
          <Skeleton style={styles.skeletonAvatar} />
          <View style={styles.skeletonLines}>
            <Skeleton style={styles.skeletonLineWide} />
            <Skeleton style={styles.skeletonLineNarrow} />
          </View>
        </View>
      ))}
    </View>
  );
}

// --------------------------------------------------------------------------- //
// Press feedback
// --------------------------------------------------------------------------- //

/**
 * Wrap a Pressable's style so every tap is visibly acknowledged. Usage:
 * `style={pressedStyle(styles.row)}`. Kept to opacity: a scale transform on
 * list rows causes visible reflow jitter on low-end phones.
 */
export function pressedStyle(
  ...base: Array<StyleProp<ViewStyle>>
): (state: PressableStateCallbackType) => StyleProp<ViewStyle> {
  return ({ pressed }) => [...base, pressed && { opacity: 0.65 }];
}

// --------------------------------------------------------------------------- //
// Text helpers
// --------------------------------------------------------------------------- //

export function Title({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function Subtitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

/** Thousands separators, so 119389 reads as 119,389 at a glance. */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--';
  return value.toLocaleString('en-KE');
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.base,
    ...shadow.sm,
  },
  sectionLabel: {
    ...typography.micro,
    color: colors.inkFaint,
    marginBottom: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    gap: spacing.base,
  },
  detailLabel: { ...typography.caption, color: colors.inkMuted, flexShrink: 0 },
  detailValue: {
    ...typography.bodyStrong,
    color: colors.ink,
    flex: 1,
    textAlign: 'right',
  },
  detailValueMono: { fontVariant: ['tabular-nums'] },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    gap: 6,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { ...typography.label, fontSize: 12 },
  banner: {
    flexDirection: 'row',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  bannerBar: { width: 3 },
  bannerBody: { flex: 1, padding: spacing.md },
  bannerTitle: { ...typography.label, marginBottom: 2 },
  bannerMessage: { ...typography.caption, color: colors.ink, lineHeight: 19 },
  bannerAction: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  bannerActionText: { ...typography.label },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  centredText: {
    ...typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
  emptyIcon: { marginBottom: spacing.xs },
  emptyTitle: { ...typography.heading, color: colors.ink, textAlign: 'center' },
  emptyAction: {
    marginTop: spacing.sm,
    backgroundColor: colors.green,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  emptyActionText: { ...typography.bodyStrong, fontSize: 14, color: colors.white },
  skeleton: {
    backgroundColor: colors.line,
    borderRadius: radius.sm,
  },
  skeletonList: { gap: spacing.sm, padding: spacing.base },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.base,
  },
  skeletonAvatar: { width: 42, height: 42, borderRadius: 21 },
  skeletonLines: { flex: 1, gap: spacing.sm },
  skeletonLineWide: { height: 14, width: '72%' },
  skeletonLineNarrow: { height: 11, width: '45%' },
  title: { ...typography.title, color: colors.ink },
  subtitle: { ...typography.body, color: colors.inkMuted, lineHeight: 21 },
});
