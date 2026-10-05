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
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AdminHeader, HeaderAction } from '../../src/components/AdminHeader';
import { AnimatedNumber } from '../../src/components/AnimatedNumber';
import { ElectionCountdown } from '../../src/components/ElectionCountdown';
import { Card, SectionLabel, formatNumber, pressedStyle } from '../../src/components/ui';
import { useAdminUnread } from '../../src/hooks/useChat';
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
  const unread = useAdminUnread();

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

        {/* Agents waiting on an answer outrank everything below the clock. */}
        {unread > 0 ? (
          <Animated.View entering={FadeInDown.duration(240)}>
            <Pressable
              style={pressedStyle(styles.unreadBanner)}
              onPress={() => router.navigate('/(app)/inbox')}
              accessibilityRole="button"
              accessibilityLabel={`${unread} unread messages from agents. Open the inbox.`}
            >
              <View style={styles.unreadIcon}>
                <Ionicons name="chatbubbles" size={18} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.unreadTitle}>
                  {unread} unread message{unread === 1 ? '' : 's'}
                </Text>
                <Text style={styles.unreadHint}>
                  Agents in the field are waiting for a reply
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.gold} />
            </Pressable>
          </Animated.View>
        ) : null}

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
          <Pressable
            style={pressedStyle(styles.statCard)}
            onPress={() => router.navigate('/(app)/people')}
          >
            {peopleStats.data ? (
              <AnimatedNumber value={peopleStats.data.total} style={styles.statValue} />
            ) : (
              <Text style={styles.statValue}>--</Text>
            )}
            <Text style={styles.statLabel}>My people</Text>
          </Pressable>
          <Pressable
            style={pressedStyle(styles.statCard)}
            onPress={() => router.navigate('/(app)/people')}
          >
            {peopleStats.data ? (
              <AnimatedNumber
                value={peopleStats.data.assigned}
                style={[styles.statValue, { color: colors.verified }]}
              />
            ) : (
              <Text style={[styles.statValue, { color: colors.verified }]}>--</Text>
            )}
            <Text style={styles.statLabel}>At a centre</Text>
          </Pressable>
          <Pressable
            style={pressedStyle(styles.statCard)}
            onPress={() => router.navigate('/(app)/events')}
          >
            {events.data ? (
              <AnimatedNumber
                value={upcomingCount}
                style={[styles.statValue, { color: colors.gold }]}
              />
            ) : (
              <Text style={[styles.statValue, { color: colors.gold }]}>--</Text>
            )}
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
          ).map(([route, icon, label, hint], i) => (
            <Animated.View
              key={route}
              entering={FadeInDown.delay(Math.min(i, 5) * 50).duration(240)}
              style={styles.actionCell}
            >
              <Pressable
                style={pressedStyle(styles.actionCard)}
                onPress={() => router.navigate(`/(app)/${route}`)}
              >
                <View style={styles.actionIcon}>
                  <Ionicons name={icon} size={20} color={colors.green} />
                </View>
                {route === 'inbox' && unread > 0 ? (
                  <View style={styles.actionBadge}>
                    <Text style={styles.actionBadgeText}>
                      {unread > 99 ? '99+' : unread}
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.actionLabel}>{label}</Text>
                <Text style={styles.actionHint}>{hint}</Text>
              </Pressable>
            </Animated.View>
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  body: { padding: spacing.base, gap: spacing.md },

  unreadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.goldSurface,
    borderColor: colors.goldLight,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  unreadIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadTitle: { ...typography.bodyStrong, fontSize: 14, color: colors.ink },
  unreadHint: { ...typography.caption, fontSize: 11, color: colors.inkMuted },

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
  actionCell: { width: '48%', flexGrow: 1 },
  actionCard: {
    flex: 1,
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
  actionBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  actionBadgeText: { ...typography.micro, fontSize: 11, color: colors.white },
  actionLabel: { ...typography.bodyStrong, fontSize: 14, color: colors.ink },
  actionHint: { ...typography.caption, fontSize: 11, color: colors.inkFaint },
});
