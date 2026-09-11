/**
 * Small shared UI primitives.
 *
 * Grouped in one file rather than split across a dozen modules: each is a few
 * lines, and they are almost always imported together.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

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

const STATUS_STYLE: Record<
  SubmissionStatus,
  { label: string; fg: string; bg: string }
> = {
  // "Awaiting review" rather than "Pending": it tells the agent someone else
  // now has it, which is the thing they actually want to know.
  PENDING: { label: 'Awaiting review', fg: colors.pending, bg: colors.pendingSurface },
  VERIFIED: { label: 'Verified', fg: colors.verified, bg: colors.verifiedSurface },
  FLAGGED: { label: 'Flagged', fg: colors.flagged, bg: colors.flaggedSurface },
  REJECTED: { label: 'Rejected', fg: colors.rejected, bg: colors.rejectedSurface },
};

export function StatusPill({ status }: { status: SubmissionStatus }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.PENDING;
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

export function LoadingState({ message = 'Loading' }: { message?: string }) {
  return (
    <View style={styles.centred}>
      <ActivityIndicator color={colors.green} size="large" />
      <Text style={styles.centredText}>{message}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  message,
  icon,
}: {
  title: string;
  message: string;
  icon?: React.ReactNode;
}) {
  return (
    <Animated.View entering={FadeIn.duration(260)} style={styles.centred}>
      {icon ? <View style={styles.emptyIcon}>{icon}</View> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.centredText}>{message}</Text>
    </Animated.View>
  );
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
  title: { ...typography.title, color: colors.ink },
  subtitle: { ...typography.body, color: colors.inkMuted, lineHeight: 21 },
});
