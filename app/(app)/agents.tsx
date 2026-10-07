/**
 * Admin: the agents directory.
 *
 * The question this answers is immediate and physical: "who is my agent at
 * this station / in this ward, and what is their number?" So the screen is a
 * search box over everything a thumb might know -- name, phone, polling
 * station, ward, constituency (all folded into the backend's `location`
 * display string) -- and every row ends in a call button.
 *
 * The full list is fetched once and filtered client-side: a campaign's agent
 * roster is hundreds of rows, and filtering in memory answers every keystroke
 * instantly on the worst phone, with zero data cost.
 */

import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as api from '../../src/api/endpoints';
import type { AgentListItem, AgentLiveStatus } from '../../src/api/types';
import { AdminHeader } from '../../src/components/AdminHeader';
import {
  EmptyState,
  SkeletonList,
  formatNumber,
  pressedStyle,
} from '../../src/components/ui';
import * as haptics from '../../src/services/haptics';
import { HIT_SLOP, MIN_TOUCH, colors, radius, spacing, typography } from '../../src/theme';

const STATUS_META: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Active', color: colors.verified },
  INVITED: { label: 'Invited', color: colors.pending },
  SUSPENDED: { label: 'Suspended', color: colors.rejected },
  INACTIVE: { label: 'Inactive', color: colors.inkFaint },
};

const LEVEL_LABEL: Record<string, string> = {
  POLLING_STATION: 'Station agent',
  WARD: 'Ward agent',
  CONSTITUENCY: 'Constituency agent',
};

/** The two live chips lead: on election morning "who has not checked in" and
 * "who is unreachable" are the questions that get agents called. */
const FILTERS = [
  { value: '', label: 'All' },
  { value: 'NOT_CHECKED_IN', label: 'Not checked in' },
  { value: 'ONLINE', label: 'Online' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

function call(phone: string) {
  Linking.openURL(`tel:${phone}`).catch(() => undefined);
}

/** Last position in the phone's maps app -- deliberately not an embedded map. */
function openInMaps(lat: number, lng: number, label: string) {
  const q = `${lat},${lng}`;
  Linking.openURL(`geo:${q}?q=${q}(${encodeURIComponent(label)})`).catch(() =>
    Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`).catch(
      () => undefined,
    ),
  );
}

function lastSeenText(live: AgentLiveStatus | undefined): string {
  const iso = live?.last_seen_at ?? live?.last_location_at;
  if (!iso) return 'Never seen';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
}

function checkInText(c: NonNullable<AgentLiveStatus['check_in']>): string {
  const d = new Date(c.checked_in_at);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (c.verified) return `Checked in ${time} · at station`;
  if (c.distance_m !== null) return `Checked in ${time} · ${formatNumber(c.distance_m)} m away`;
  return `Checked in ${time}`;
}

export default function AgentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const query = useQuery({
    queryKey: ['admin', 'agents'],
    queryFn: api.fetchAgents,
    staleTime: 60_000,
  });

  // Presence and check-ins ride alongside the roster and refresh on their
  // own cadence; the directory stays usable even if this call fails.
  const liveQuery = useQuery({
    queryKey: ['admin', 'agentsLive'],
    queryFn: api.fetchAgentLiveStatus,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const liveById = useMemo(() => {
    const map = new Map<string, AgentLiveStatus>();
    for (const row of liveQuery.data?.results ?? []) map.set(row.id, row);
    return map;
  }, [liveQuery.data]);

  const activeTotal = liveQuery.data?.results.length ?? 0;
  const onlineCount = (liveQuery.data?.results ?? []).filter((a) => a.online).length;
  const checkedInCount = (liveQuery.data?.results ?? []).filter((a) => a.check_in).length;

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = (query.data ?? []).filter((agent) => {
      const live = liveById.get(agent.id);
      if (statusFilter === 'ONLINE') {
        if (!live?.online) return false;
      } else if (statusFilter === 'NOT_CHECKED_IN') {
        // Only active agents are expected to check in.
        if (agent.status !== 'ACTIVE' || live?.check_in) return false;
      } else if (statusFilter && agent.status !== statusFilter) {
        return false;
      }
      if (!needle) return true;
      return (
        agent.full_name.toLowerCase().includes(needle) ||
        agent.phone_number.includes(needle) ||
        (agent.location ?? '').toLowerCase().includes(needle) ||
        (agent.supervisor_name ?? '').toLowerCase().includes(needle)
      );
    });
    // The agents who need a call float to the top: active but not checked in,
    // then offline, then everyone else -- alphabetical within each band.
    const band = (agent: AgentListItem) => {
      if (agent.status !== 'ACTIVE') return 3;
      const live = liveById.get(agent.id);
      if (!live?.check_in) return 0;
      if (!live.online) return 1;
      return 2;
    };
    return rows
      .slice()
      .sort((a, b) => band(a) - band(b) || a.full_name.localeCompare(b.full_name));
  }, [query.data, liveById, search, statusFilter]);

  return (
    <View style={styles.screen}>
      <AdminHeader
        kicker="FIELD TEAM"
        title={`Agents${query.data ? ` · ${formatNumber(filtered.length)}` : ''}`}
        onBack={() => router.back()}
      />

      {activeTotal > 0 ? (
        <View style={styles.pulseStrip}>
          <View style={styles.pulseItem}>
            <Ionicons name="checkmark-circle" size={14} color={colors.verified} />
            <Text style={styles.pulseText}>
              {formatNumber(checkedInCount)}/{formatNumber(activeTotal)} checked in
            </Text>
          </View>
          <View style={styles.pulseItem}>
            <View style={[styles.presenceDot, { backgroundColor: colors.verified }]} />
            <Text style={styles.pulseText}>{formatNumber(onlineCount)} online</Text>
          </View>
        </View>
      ) : null}

      <View style={[styles.searchBox, { marginTop: spacing.md }]}>
        <Ionicons name="search" size={16} color={colors.inkFaint} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Name, phone, station, ward…"
          placeholderTextColor={colors.inkFaint}
          autoCorrect={false}
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={HIT_SLOP}>
            <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((filter) => {
          const active = statusFilter === filter.value;
          return (
            <Pressable
              key={filter.value}
              style={pressedStyle(styles.filterChip, active && styles.filterChipActive)}
              onPress={() => setStatusFilter(filter.value)}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {query.isPending ? (
        <SkeletonList rows={8} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(agent) => agent.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => {
                void query.refetch();
                void liveQuery.refetch();
              }}
              tintColor={colors.green}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={search || statusFilter ? 'No agents match' : 'No agents yet'}
              message={
                search || statusFilter
                  ? 'Try a different name, number or place.'
                  : 'Agents are registered from the web Command Centre.'
              }
              icon={<Ionicons name="people-outline" size={40} color={colors.inkFaint} />}
            />
          }
          renderItem={({ item }: { item: AgentListItem }) => {
            const status = STATUS_META[item.status] ?? {
              label: item.status,
              color: colors.inkFaint,
            };
            const live = liveById.get(item.id);
            return (
              <View style={styles.row}>
                <View
                  style={[
                    styles.presenceDot,
                    {
                      backgroundColor: live?.online ? colors.verified : colors.line,
                    },
                  ]}
                  accessibilityLabel={live?.online ? 'Online' : 'Offline'}
                />
                <View style={styles.rowBody}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.full_name}
                    </Text>
                    <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                    <Text style={[styles.statusText, { color: status.color }]}>
                      {status.label}
                    </Text>
                  </View>
                  {item.status === 'ACTIVE' ? (
                    <Text
                      style={[
                        styles.checkIn,
                        { color: live?.check_in ? colors.verified : colors.pending },
                        live?.check_in && !live.check_in.verified
                          ? { color: colors.pending }
                          : null,
                      ]}
                    >
                      {live?.check_in ? checkInText(live.check_in) : 'Not checked in'}
                      {'  ·  '}
                      <Text style={styles.lastSeen}>
                        {live?.online ? 'Online' : lastSeenText(live)}
                      </Text>
                    </Text>
                  ) : null}
                  <Text style={styles.phone}>{item.phone_number || 'No phone'}</Text>
                  {item.location ? (
                    <View style={styles.locationRow}>
                      <Ionicons name="location-outline" size={12} color={colors.inkMuted} />
                      <Text style={styles.location} numberOfLines={1}>
                        {item.location}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={styles.level}>
                    {LEVEL_LABEL[item.level] ?? item.level}
                    {item.supervisor_name ? ` · reports to ${item.supervisor_name}` : ''}
                  </Text>
                </View>
                {live && live.latitude !== null && live.longitude !== null ? (
                  <Pressable
                    style={pressedStyle(styles.mapButton)}
                    onPress={() => {
                      haptics.tap();
                      openInMaps(live.latitude!, live.longitude!, item.full_name);
                    }}
                    accessibilityLabel={`Show ${item.full_name} on the map`}
                  >
                    <Ionicons name="location" size={18} color={colors.info} />
                  </Pressable>
                ) : null}
                {item.phone_number ? (
                  <Pressable
                    style={pressedStyle(styles.callButton)}
                    onPress={() => {
                      haptics.tap();
                      call(item.phone_number);
                    }}
                    accessibilityLabel={`Call ${item.full_name}`}
                  >
                    <Ionicons name="call" size={20} color={colors.white} />
                  </Pressable>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    minHeight: MIN_TOUCH,
  },
  searchInput: { ...typography.body, color: colors.ink, flex: 1, paddingVertical: 10 },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  pulseStrip: {
    flexDirection: 'row',
    gap: spacing.base,
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pulseItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pulseText: { ...typography.label, fontSize: 12, color: colors.ink },
  presenceDot: { width: 10, height: 10, borderRadius: 5 },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    minHeight: 36,
    justifyContent: 'center',
  },
  filterChipActive: { backgroundColor: colors.green, borderColor: colors.green },
  filterText: { ...typography.label, fontSize: 12, color: colors.inkMuted },
  filterTextActive: { color: colors.white },
  list: { paddingHorizontal: spacing.base },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  rowBody: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...typography.bodyStrong, color: colors.ink, flexShrink: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { ...typography.micro, fontSize: 10 },
  phone: {
    ...typography.body,
    fontSize: 14,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  location: { ...typography.caption, fontSize: 12, color: colors.inkMuted, flexShrink: 1 },
  level: { ...typography.caption, fontSize: 11, color: colors.inkFaint },
  checkIn: { ...typography.label, fontSize: 12 },
  lastSeen: { ...typography.caption, fontSize: 11, color: colors.inkFaint },
  mapButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.infoSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
