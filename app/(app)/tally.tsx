/**
 * Admin: live tally, the screen the aspirant refreshes all night.
 *
 * Pick a race, watch the numbers. Reuses the agent app's LiveTallyCard --
 * animated bars, change-flash -- and the same 30-second polling cadence
 * (useLiveTally), because a phone on cell data gets freshness by asking, not
 * by holding a socket open.
 *
 * The chosen race is remembered in state only: election night is one race at
 * a time anyway, and the list is one tap away.
 */

import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as api from '../../src/api/endpoints';
import { AdminHeader } from '../../src/components/AdminHeader';
import { AnimatedNumber } from '../../src/components/AnimatedNumber';
import { LiveTallyCard } from '../../src/components/LiveTallyCard';
import {
  Banner,
  Card,
  EmptyState,
  SectionLabel,
  SkeletonList,
  formatNumber,
  pressedStyle,
} from '../../src/components/ui';
import { useLiveTally } from '../../src/hooks/useLiveTally';
import { useNow } from '../../src/hooks/useNow';
import { colors, radius, spacing, typography } from '../../src/theme';

export default function TallyScreen() {
  const insets = useSafeAreaInsets();
  const [raceId, setRaceId] = useState<string | null>(null);

  const races = useQuery({
    queryKey: ['admin', 'races'],
    queryFn: api.fetchRaces,
    staleTime: 10 * 60_000,
  });

  // Default to the first active race once the list arrives.
  const activeRaces = (races.data ?? []).filter((r) => r.is_active);
  const allRaces = activeRaces.length > 0 ? activeRaces : (races.data ?? []);
  const selectedId = raceId ?? allRaces[0]?.id ?? null;
  const selected = allRaces.find((r) => r.id === selectedId) ?? null;

  const tally = useLiveTally(selectedId);

  // "Updated 40s ago": a figure without an age is a figure nobody trusts on
  // election night. dataUpdatedAt is react-query's timestamp of the last
  // successful fetch; useNow keeps the label ticking.
  const now = useNow();
  const ageSeconds = tally.dataUpdatedAt
    ? Math.max(0, Math.round((now - tally.dataUpdatedAt) / 1000))
    : null;
  const updatedLabel =
    ageSeconds === null
      ? null
      : ageSeconds < 5
        ? 'Updated just now'
        : ageSeconds < 60
          ? `Updated ${ageSeconds}s ago`
          : `Updated ${Math.floor(ageSeconds / 60)}m ago`;

  if (races.isPending) {
    return (
      <View style={styles.screen}>
        <AdminHeader kicker="LIVE RESULTS" title="Tally" />
        <SkeletonList rows={4} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <AdminHeader kicker="LIVE RESULTS" title="Tally" />

      {allRaces.length === 0 ? (
        <EmptyState
          title="No races configured"
          message="Set up the election's races in the web Command Centre first."
          icon={<Ionicons name="stats-chart-outline" size={40} color={colors.inkFaint} />}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={tally.isRefetching}
              onRefresh={() => tally.refetch()}
              tintColor={colors.green}
            />
          }
        >
          <SectionLabel>Race</SectionLabel>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.raceRow}
          >
            {allRaces.map((race) => {
              const active = race.id === selectedId;
              return (
                <Pressable
                  key={race.id}
                  style={pressedStyle(styles.raceChip, active && styles.raceChipActive)}
                  onPress={() => setRaceId(race.id)}
                >
                  <Text
                    style={[styles.raceChipText, active && styles.raceChipTextActive]}
                    numberOfLines={1}
                  >
                    {race.race_type_display || race.title}
                  </Text>
                  <Text
                    style={[styles.raceChipMeta, active && styles.raceChipTextActive]}
                    numberOfLines={1}
                  >
                    {race.geography_name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {tally.isPending ? (
            <SkeletonList rows={4} />
          ) : tally.isError ? (
            <Banner
              tone="warning"
              title="Tally unavailable"
              message="Could not reach the tally service. It retries automatically every 30 seconds."
            />
          ) : tally.data ? (
            <>
              {updatedLabel ? (
                <Text style={styles.updatedLabel}>{updatedLabel}</Text>
              ) : null}

              <LiveTallyCard tally={tally.data} />

              <SectionLabel>Reporting</SectionLabel>
              <Card>
                <View style={styles.statRow}>
                  <View style={styles.stat}>
                    <AnimatedNumber
                      value={tally.data.summary.stations_reporting}
                      style={styles.statValue}
                    />
                    <Text style={styles.statLabel}>Stations in</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>
                      {tally.data.summary.reporting_percentage.toFixed(1)}%
                    </Text>
                    <Text style={styles.statLabel}>Reported</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>
                      {tally.data.summary.turnout_percentage.toFixed(1)}%
                    </Text>
                    <Text style={styles.statLabel}>Turnout</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.statRow}>
                  <View style={styles.stat}>
                    <AnimatedNumber
                      value={tally.data.summary.total_valid_votes}
                      style={styles.statValueSmall}
                    />
                    <Text style={styles.statLabel}>Valid votes</Text>
                  </View>
                  <View style={styles.stat}>
                    <AnimatedNumber
                      value={tally.data.summary.total_rejected_votes}
                      style={styles.statValueSmall}
                    />
                    <Text style={styles.statLabel}>Rejected</Text>
                  </View>
                  <View style={styles.stat}>
                    <AnimatedNumber
                      value={tally.data.summary.total_registered_voters}
                      style={styles.statValueSmall}
                    />
                    <Text style={styles.statLabel}>Registered</Text>
                  </View>
                </View>
              </Card>

              {selected ? (
                <Text style={styles.footnote}>
                  {selected.election_name} · {selected.candidate_count} candidates on the
                  ballot
                </Text>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  body: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  raceRow: { gap: spacing.sm, paddingBottom: spacing.xs },
  raceChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    maxWidth: 220,
    minHeight: 48,
    justifyContent: 'center',
  },
  raceChipActive: { backgroundColor: colors.green, borderColor: colors.green },
  raceChipText: { ...typography.bodyStrong, fontSize: 14, color: colors.ink },
  raceChipMeta: { ...typography.caption, fontSize: 11, color: colors.inkMuted },
  raceChipTextActive: { color: colors.white },
  statRow: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { ...typography.numeric, color: colors.green },
  statValueSmall: { ...typography.numeric, fontSize: 16, color: colors.ink },
  statLabel: { ...typography.caption, fontSize: 11, color: colors.inkMuted },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: spacing.md },
  updatedLabel: {
    ...typography.caption,
    fontSize: 11,
    color: colors.inkFaint,
    textAlign: 'right',
  },
  footnote: {
    ...typography.caption,
    fontSize: 11,
    color: colors.inkFaint,
    textAlign: 'center',
  },
});
