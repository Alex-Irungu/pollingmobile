/**
 * Admin: the electoral structure, as a drilldown.
 *
 * County > Constituency > Ward > Centre, each level one short list with the
 * numbers that matter while physically in that area: how many stations, how
 * many registered voters, and how many of *our people* are recorded there.
 * A ward showing 12 stations and 0 people is the gap you fix while you are
 * standing in it.
 *
 * Read-only by design -- geography is written only by the IEBC import
 * pipeline on the web.
 */

import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as api from '../../src/api/endpoints';
import type { StructureItem } from '../../src/api/types';
import { AdminHeader } from '../../src/components/AdminHeader';
import {
  EmptyState,
  SkeletonList,
  formatNumber,
  pressedStyle,
} from '../../src/components/ui';
import * as haptics from '../../src/services/haptics';
import { HIT_SLOP, MIN_TOUCH, colors, radius, spacing, typography } from '../../src/theme';

type Level = 'county' | 'constituency' | 'ward' | 'centre';

const NEXT_LEVEL: Partial<Record<Level, Level>> = {
  county: 'constituency',
  constituency: 'ward',
  ward: 'centre',
};

const LEVEL_TITLE: Record<Level, string> = {
  county: 'Counties',
  constituency: 'Constituencies',
  ward: 'Wards',
  centre: 'Polling centres',
};

interface Crumb {
  level: Level;
  parentId?: string;
  parentName?: string;
}

export default function StructureScreen() {
  const insets = useSafeAreaInsets();
  // A stack of where we have drilled to; the top is what renders.
  const [stack, setStack] = useState<Crumb[]>([{ level: 'county' }]);
  const [search, setSearch] = useState('');
  const current = stack[stack.length - 1];

  const query = useQuery({
    queryKey: ['admin', 'structure', current.level, current.parentId ?? ''],
    queryFn: () => api.fetchStructure(current.level, current.parentId),
    staleTime: 5 * 60_000,
  });

  const needle = search.trim().toLowerCase();
  const items = (query.data?.items ?? []).filter(
    (item) => !needle || item.name.toLowerCase().includes(needle),
  );

  function drillInto(item: StructureItem) {
    const next = NEXT_LEVEL[current.level];
    if (!next) return;
    setSearch('');
    setStack([...stack, { level: next, parentId: item.id, parentName: item.name }]);
  }

  function goBack() {
    if (stack.length === 1) return;
    setSearch('');
    setStack(stack.slice(0, -1));
  }

  const breadcrumb = stack
    .slice(1)
    .map((c) => c.parentName)
    .filter(Boolean)
    .join(' › ');

  return (
    <View style={styles.screen}>
      <AdminHeader
        kicker={breadcrumb ? breadcrumb.toUpperCase() : 'ELECTORAL STRUCTURE'}
        title={LEVEL_TITLE[current.level]}
        onBack={stack.length > 1 ? goBack : undefined}
      />

      <View style={[styles.searchBox, { marginTop: spacing.md }]}>
        <Ionicons name="search" size={16} color={colors.inkFaint} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={`Search ${LEVEL_TITLE[current.level].toLowerCase()}…`}
          placeholderTextColor={colors.inkFaint}
          autoCorrect={false}
        />
      </View>

      {query.isPending ? (
        <SkeletonList rows={8} />
      ) : items.length === 0 ? (
        <EmptyState
          title={needle ? 'Nothing matches' : 'No data'}
          message={
            needle
              ? 'Try a different name.'
              : 'No active IEBC dataset — import one from the web Command Centre.'
          }
          icon={<Ionicons name="git-branch-outline" size={40} color={colors.inkFaint} />}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          renderItem={({ item }) => {
            const drillable = !!NEXT_LEVEL[current.level];
            return (
              <Pressable
                style={drillable ? pressedStyle(styles.row) : styles.row}
                onPress={() => {
                  haptics.tap();
                  drillInto(item);
                }}
                disabled={!drillable}
              >
                <View style={styles.rowBody}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowMeta}>
                    {formatNumber(item.stations)} stations ·{' '}
                    {formatNumber(item.registered_voters)} voters
                  </Text>
                </View>
                <View style={styles.peopleBadge}>
                  <Text
                    style={[
                      styles.peopleCount,
                      item.people === 0 && styles.peopleCountZero,
                    ]}
                  >
                    {formatNumber(item.people)}
                  </Text>
                  <Text style={styles.peopleLabel}>people</Text>
                </View>
                {drillable ? (
                  <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
                ) : null}
              </Pressable>
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
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    minHeight: MIN_TOUCH,
  },
  searchInput: { ...typography.body, color: colors.ink, flex: 1, paddingVertical: 10 },
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
    minHeight: MIN_TOUCH + 12,
  },
  rowBody: { flex: 1, gap: 2 },
  rowName: { ...typography.bodyStrong, color: colors.ink },
  rowMeta: { ...typography.caption, fontSize: 12, color: colors.inkMuted },
  peopleBadge: { alignItems: 'center', minWidth: 48 },
  peopleCount: { ...typography.numeric, fontSize: 16, color: colors.green },
  peopleCountZero: { color: colors.pending },
  peopleLabel: { ...typography.caption, fontSize: 10, color: colors.inkFaint },
});
