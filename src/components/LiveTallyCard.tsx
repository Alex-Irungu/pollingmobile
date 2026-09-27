/**
 * Live tally card for My Station.
 *
 * The numbers move. When a poll brings new figures, the changed row flashes
 * softly and the bars ease to their new widths instead of jumping -- not
 * decoration, but an answer to the question an agent actually has while
 * staring at this screen: "is this thing updating, or is it frozen?"
 * Movement is the proof of life.
 *
 * Bars animate in measured pixels (onLayout) rather than percentage strings:
 * width animation on a number is reliable across Reanimated versions where
 * percentage-string animation is not.
 */

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { LiveTally, LiveTallyCandidate } from '../api/types';
import { Card, SectionLabel, formatNumber } from './ui';
import { colors, spacing, typography } from '../theme';

const BAR_ANIM_MS = 600;
const FLASH_MS = 900;

function TallyRow({
  candidate,
  isLast,
}: {
  candidate: LiveTallyCandidate;
  isLast: boolean;
}) {
  const share = Math.max(0, Math.min(100, candidate.percentage));

  const [trackWidth, setTrackWidth] = useState(0);
  const barWidth = useSharedValue(0);
  const flash = useSharedValue(0);
  const previousVotes = useRef<number | null>(null);

  useEffect(() => {
    if (trackWidth > 0) {
      barWidth.value = withTiming((trackWidth * share) / 100, {
        duration: BAR_ANIM_MS,
      });
    }
  }, [share, trackWidth, barWidth]);

  useEffect(() => {
    // Flash only on a *change*, never on first render -- a screen that
    // lights up like a fruit machine on open teaches agents to ignore it.
    if (previousVotes.current !== null && previousVotes.current !== candidate.votes) {
      flash.value = 1;
      flash.value = withTiming(0, { duration: FLASH_MS });
    }
    previousVotes.current = candidate.votes;
  }, [candidate.votes, flash]);

  const barStyle = useAnimatedStyle(() => ({ width: barWidth.value }));
  const flashStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      flash.value,
      [0, 1],
      ['rgba(0,0,0,0)', colors.greenSurface],
    ),
  }));

  return (
    <Animated.View
      style={[styles.row, !isLast && styles.divider, flashStyle]}
    >
      <View style={styles.nameRow}>
        <Text
          style={[styles.name, candidate.is_my_candidate && styles.myName]}
          numberOfLines={1}
        >
          {candidate.full_name}
          {candidate.is_my_candidate ? '  ★' : ''}
        </Text>
        <Text style={styles.votes}>{formatNumber(candidate.votes)}</Text>
      </View>
      <View
        style={styles.track}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        <Animated.View
          style={[
            styles.fill,
            candidate.is_my_candidate ? styles.fillMine : styles.fillOther,
            barStyle,
          ]}
        />
      </View>
      <View style={styles.nameRow}>
        <Text style={styles.party}>{candidate.party || 'INDEPENDENT'}</Text>
        <Text style={styles.percent}>{share.toFixed(1)}%</Text>
      </View>
    </Animated.View>
  );
}

export function LiveTallyCard({ tally }: { tally: LiveTally }) {
  return (
    <View style={styles.block}>
      <SectionLabel>Live tally — {tally.race.title}</SectionLabel>
      <Card>
        <View style={styles.metaRow}>
          <View style={styles.liveDot} />
          <Text style={styles.meta}>
            {formatNumber(tally.summary.stations_reporting)} of{' '}
            {formatNumber(tally.summary.total_stations)} stations reporting
            {' · '}updates automatically
          </Text>
        </View>
        {tally.candidates.map((candidate, index) => (
          <TallyRow
            key={candidate.id}
            candidate={candidate}
            isLast={index === tally.candidates.length - 1}
          />
        ))}
        <Text style={styles.footnote}>
          Campaign's own tally from agent reports — not official IEBC results.
        </Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.verified,
  },
  meta: { ...typography.caption, fontSize: 12, color: colors.inkMuted, flex: 1 },
  row: {
    paddingVertical: spacing.md,
    gap: 6,
    marginHorizontal: -spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: 8,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  name: { ...typography.bodyStrong, color: colors.ink, flex: 1 },
  myName: { color: colors.green },
  votes: { ...typography.numeric, fontSize: 16, color: colors.ink },
  percent: { ...typography.caption, fontSize: 12, color: colors.inkMuted },
  party: { ...typography.caption, fontSize: 12, color: colors.inkMuted },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  fillMine: { backgroundColor: colors.green },
  fillOther: { backgroundColor: colors.gold },
  footnote: {
    ...typography.caption,
    fontSize: 11,
    color: colors.inkFaint,
    marginTop: spacing.sm,
  },
});
