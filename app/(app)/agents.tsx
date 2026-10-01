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
import type { AgentListItem } from '../../src/api/types';
import { AdminHeader } from '../../src/components/AdminHeader';
import { EmptyState, LoadingState, formatNumber } from '../../src/components/ui';
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

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INVITED', label: 'Invited' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

function call(phone: string) {
  Linking.openURL(`tel:${phone}`).catch(() => undefined);
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

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (query.data ?? []).filter((agent) => {
      if (statusFilter && agent.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        agent.full_name.toLowerCase().includes(needle) ||
        agent.phone_number.includes(needle) ||
        (agent.location ?? '').toLowerCase().includes(needle) ||
        (agent.supervisor_name ?? '').toLowerCase().includes(needle)
      );
    });
  }, [query.data, search, statusFilter]);

  return (
    <View style={styles.screen}>
      <AdminHeader
        kicker="FIELD TEAM"
        title={`Agents${query.data ? ` · ${formatNumber(filtered.length)}` : ''}`}
        onBack={() => router.back()}
      />

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
        {STATUS_FILTERS.map((filter) => {
          const active = statusFilter === filter.value;
          return (
            <Pressable
              key={filter.value}
              style={[styles.filterChip, active && styles.filterChipActive]}
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
        <LoadingState message="Loading agents…" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(agent) => agent.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => query.refetch()}
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
            return (
              <View style={styles.row}>
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
                {item.phone_number ? (
                  <Pressable
                    style={styles.callButton}
                    onPress={() => call(item.phone_number)}
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
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
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
  callButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
