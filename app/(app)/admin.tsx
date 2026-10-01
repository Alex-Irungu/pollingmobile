/**
 * Admin: the dashboard the app opens onto.
 *
 * One screen answering the questions an aspirant has while moving: what is
 * happening next (events with live countdowns and callable contacts), how is
 * the ground network growing (people stats), and quick ways into the tabs.
 * Sign-out lives here too, since admin mode hides the agent Profile tab.
 */

import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as api from '../../src/api/endpoints';
import type { AdminEvent } from '../../src/api/types';
import { AdminHeader, HeaderAction } from '../../src/components/AdminHeader';
import { ElectionCountdown } from '../../src/components/ElectionCountdown';
import { Card, SectionLabel, formatNumber } from '../../src/components/ui';
import { splitMs, useNow } from '../../src/hooks/useNow';
import { useMe } from '../../src/hooks/useMe';
import { useAuth } from '../../src/store/auth';
import { colors, radius, spacing, typography } from '../../src/theme';

const pad2 = (n: number) => String(n).padStart(2, '0');

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-KE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Compact ticking countdown for the "next up" card. */
function NextUpCountdown({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  const now = useNow();
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();

  if (now >= end) return null;
  if (now >= start) {
    return (
      <View style={styles.liveRow}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>HAPPENING NOW</Text>
      </View>
    );
  }

  const parts = splitMs(start - now);
  return (
    <View style={styles.countRow}>
      {(
        [
          [parts.days, 'DAYS'],
          [parts.hours, 'HRS'],
          [parts.minutes, 'MIN'],
          [parts.seconds, 'SEC'],
        ] as const
      ).map(([value, label]) => (
        <View key={label} style={styles.countBox}>
          <Text style={styles.countValue}>{pad2(value)}</Text>
          <Text style={styles.countLabel}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { fullName } = useMe();
  const { signOut } = useAuth();

  const range = useMemo(() => {
    const now = new Date();
    return {
      from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
      to: new Date(now.getFullYear(), now.getMonth() + 2, now.getDate()).toISOString(),
    };
  }, []);

  const events = useQuery({
    queryKey: ['admin', 'events'],
    queryFn: () => api.fetchAdminEvents(range.from, range.to),
    staleTime: 30_000,
  });
  const peopleStats = useQuery({
    queryKey: ['admin', 'peopleStats'],
    queryFn: api.fetchPeopleStats,
    staleTime: 60_000,
  });

  // Next up: a live event beats the soonest upcoming one.
  const nextEvent: AdminEvent | null = useMemo(() => {
    const now = Date.now();
    const list = (events.data?.results ?? [])
      .slice()
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    return (
      list.find(
        (e) => new Date(e.starts_at).getTime() <= now && now < new Date(e.ends_at).getTime(),
      ) ??
      list.find((e) => new Date(e.starts_at).getTime() > now) ??
      null
    );
  }, [events.data]);

  const upcomingCount = useMemo(() => {
    const now = Date.now();
    return (events.data?.results ?? []).filter(
      (e) => new Date(e.ends_at).getTime() > now,
    ).length;
  }, [events.data]);

  const contacts = nextEvent
    ? [
        { name: nextEvent.contact1_name, phone: nextEvent.contact1_phone },
        { name: nextEvent.contact2_name, phone: nextEvent.contact2_phone },
      ].filter((c) => c.phone)
    : [];

  function confirmSignOut() {
    Alert.alert('Sign out', 'Sign out of Sentinel on this phone?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  const firstName = fullName?.split(' ')[0] ?? 'there';

  return (
    <View style={styles.screen}>
      <AdminHeader
        kicker="COMMAND CENTRE"
        title={`Hello, ${firstName}`}
        right={<HeaderAction icon="log-out-outline" label="Logout" onPress={confirmSignOut} />}
      />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxl }]}
        refreshControl={
          <RefreshControl
            refreshing={events.isRefetching}
            onRefresh={() => {
              void events.refetch();
              void peopleStats.refetch();
            }}
            tintColor={colors.green}
          />
        }
      >
        {/* The campaign's clock: polls open 06:00, 10 Aug 2027 */}
        <ElectionCountdown />

        {/* Next event spotlight */}
        {nextEvent ? (
          <Pressable onPress={() => router.navigate('/(app)/events')}>
            <Card style={styles.nextCard}>
              <SectionLabel>Next up</SectionLabel>
              <Text style={styles.nextTitle}>{nextEvent.title}</Text>
              <Text style={styles.nextMeta}>
                {fmtDay(nextEvent.starts_at)} · {fmtTime(nextEvent.starts_at)}–
                {fmtTime(nextEvent.ends_at)}
                {nextEvent.location ? `  ·  ${nextEvent.location}` : ''}
              </Text>
              <NextUpCountdown startsAt={nextEvent.starts_at} endsAt={nextEvent.ends_at} />
              {contacts.length > 0 ? (
                <View style={styles.contactRow}>
                  {contacts.map((contact) => (
                    <Pressable
                      key={contact.phone}
                      style={styles.contactChip}
                      onPress={() =>
                        Linking.openURL(`tel:${contact.phone}`).catch(() => undefined)
                      }
                    >
                      <Ionicons name="call" size={13} color={colors.info} />
                      <Text style={styles.contactText} numberOfLines={1}>
                        {contact.name || contact.phone}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </Card>
          </Pressable>
        ) : (
          <Card>
            <SectionLabel>Events</SectionLabel>
            <Text style={styles.emptyNext}>
              Nothing scheduled. Record the next rally or meeting from the Events tab.
            </Text>
          </Card>
        )}

        {/* Ground network stats */}
        <SectionLabel>Ground network</SectionLabel>
        <View style={styles.statsRow}>
          <Pressable style={styles.statCard} onPress={() => router.navigate('/(app)/people')}>
            <Text style={styles.statValue}>
              {peopleStats.data ? formatNumber(peopleStats.data.total) : '--'}
            </Text>
            <Text style={styles.statLabel}>My people</Text>
          </Pressable>
          <Pressable style={styles.statCard} onPress={() => router.navigate('/(app)/people')}>
            <Text style={[styles.statValue, { color: colors.verified }]}>
              {peopleStats.data ? formatNumber(peopleStats.data.assigned) : '--'}
            </Text>
            <Text style={styles.statLabel}>At a centre</Text>
          </Pressable>
          <Pressable style={styles.statCard} onPress={() => router.navigate('/(app)/events')}>
            <Text style={[styles.statValue, { color: colors.gold }]}>
              {events.data ? formatNumber(upcomingCount) : '--'}
            </Text>
            <Text style={styles.statLabel}>Upcoming events</Text>
          </Pressable>
        </View>

        {/* Quick actions */}
        <SectionLabel>Quick actions</SectionLabel>
        <View style={styles.actionsGrid}>
          {(
            [
              ['people', 'person-add', 'Register a supporter', 'Name, phone, polling centre'],
              ['events', 'calendar', 'Record an event', 'With key contacts to call'],
              ['agents', 'call', 'Agents directory', 'Find and call any agent'],
              ['inbox', 'chatbubbles', 'Messages', 'Reply to agents in the field'],
              ['tally', 'stats-chart', 'Watch the tally', 'Live figures, 30s refresh'],
              ['structure', 'git-branch', 'Browse structure', 'Find coverage gaps'],
            ] as const
          ).map(([route, icon, label, hint]) => (
            <Pressable
              key={route}
              style={styles.actionCard}
              onPress={() => router.navigate(`/(app)/${route}`)}
            >
              <View style={styles.actionIcon}>
                <Ionicons name={icon} size={20} color={colors.green} />
              </View>
              <Text style={styles.actionLabel}>{label}</Text>
              <Text style={styles.actionHint}>{hint}</Text>
            </Pressable>
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  body: { padding: spacing.base, gap: spacing.md },

  nextCard: { gap: spacing.sm, borderColor: colors.greenLight, borderWidth: 1 },
  nextTitle: { ...typography.heading, color: colors.ink },
  nextMeta: { ...typography.caption, color: colors.inkMuted },
  emptyNext: { ...typography.body, color: colors.inkMuted, lineHeight: 21 },
  countRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  countBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.greenSurface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  countValue: { ...typography.numeric, color: colors.green },
  countLabel: { ...typography.micro, fontSize: 9, color: colors.inkMuted },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.verified },
  liveText: { ...typography.label, fontSize: 12, color: colors.verified },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  contactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.infoSurface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 36,
  },
  contactText: { ...typography.label, fontSize: 12, color: colors.info },

  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.base,
  },
  statValue: { ...typography.numeric, color: colors.ink },
  statLabel: { ...typography.caption, fontSize: 11, color: colors.inkMuted },

  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.base,
    gap: spacing.xs,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.greenSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  actionLabel: { ...typography.bodyStrong, fontSize: 14, color: colors.ink },
  actionHint: { ...typography.caption, fontSize: 11, color: colors.inkFaint },
});
