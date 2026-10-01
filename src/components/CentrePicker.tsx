/**
 * Cascading polling-centre picker: County -> Constituency -> Ward -> Centre.
 *
 * Kenya has tens of thousands of polling centres, so a single flat dropdown
 * is unusable on a phone. Instead the admin walks down the hierarchy -- each
 * level is a short, searchable list -- and the final centre list is a
 * type-ahead search within the chosen ward. Two or three taps for someone who
 * knows where they are standing, which on the ground they always do.
 *
 * A full-screen modal rather than an inline dropdown: at 48dp per row a
 * cascade needs the whole screen, and the ground registration flow is "open,
 * tap, tap, tap, done", not form gymnastics.
 */

import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as api from '../api/endpoints';
import type { GeoUnit, PollingCentreItem } from '../api/types';
import { HIT_SLOP, MIN_TOUCH, colors, radius, spacing, typography } from '../theme';
import { LoadingState } from './ui';

export interface PickedCentre {
  id: string;
  name: string;
  code: string;
}

type Step = 'county' | 'constituency' | 'ward' | 'centre';

const STEP_TITLE: Record<Step, string> = {
  county: 'Choose county',
  constituency: 'Choose constituency',
  ward: 'Choose ward',
  centre: 'Choose polling centre',
};

export function CentrePicker({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (centre: PickedCentre) => void;
}) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('county');
  const [county, setCounty] = useState<GeoUnit | null>(null);
  const [constituency, setConstituency] = useState<GeoUnit | null>(null);
  const [ward, setWard] = useState<GeoUnit | null>(null);
  const [search, setSearch] = useState('');

  const counties = useQuery({
    queryKey: ['geo', 'counties'],
    queryFn: api.fetchCounties,
    staleTime: Infinity, // Counties do not change mid-election.
    enabled: visible,
  });
  const constituencies = useQuery({
    queryKey: ['geo', 'constituencies', county?.id],
    queryFn: () => api.fetchConstituencies(county!.id),
    staleTime: Infinity,
    enabled: visible && !!county,
  });
  const wards = useQuery({
    queryKey: ['geo', 'wards', constituency?.id],
    queryFn: () => api.fetchWards(constituency!.id),
    staleTime: Infinity,
    enabled: visible && !!constituency,
  });
  const centres = useQuery({
    queryKey: ['geo', 'centres', ward?.id, step === 'centre' ? search : ''],
    queryFn: () => api.fetchPollingCentres(ward!.id, search || undefined),
    staleTime: 5 * 60_000,
    enabled: visible && !!ward && step === 'centre',
  });

  function reset() {
    setStep('county');
    setCounty(null);
    setConstituency(null);
    setWard(null);
    setSearch('');
  }

  function close() {
    reset();
    onClose();
  }

  function goBack() {
    setSearch('');
    if (step === 'centre') {
      setWard(null);
      setStep('ward');
    } else if (step === 'ward') {
      setConstituency(null);
      setStep('constituency');
    } else if (step === 'constituency') {
      setCounty(null);
      setStep('county');
    } else {
      close();
    }
  }

  // Which list is on screen, filtered by the search box. Geo lists are small
  // enough to filter client-side; centres are searched server-side.
  const needle = search.trim().toLowerCase();
  const filterGeo = (units: GeoUnit[] | undefined) =>
    (units ?? []).filter(
      (u) => !needle || u.name.toLowerCase().includes(needle) || u.iebc_code.includes(needle),
    );

  const geoItems: GeoUnit[] =
    step === 'county'
      ? filterGeo(counties.data)
      : step === 'constituency'
        ? filterGeo(constituencies.data)
        : step === 'ward'
          ? filterGeo(wards.data)
          : [];

  const loading =
    (step === 'county' && counties.isPending) ||
    (step === 'constituency' && constituencies.isPending) ||
    (step === 'ward' && wards.isPending) ||
    (step === 'centre' && centres.isPending);

  const breadcrumb = [county?.name, constituency?.name, ward?.name]
    .filter(Boolean)
    .join(' › ');

  function pickGeo(unit: GeoUnit) {
    setSearch('');
    if (step === 'county') {
      setCounty(unit);
      setStep('constituency');
    } else if (step === 'constituency') {
      setConstituency(unit);
      setStep('ward');
    } else if (step === 'ward') {
      setWard(unit);
      setStep('centre');
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={goBack} hitSlop={HIT_SLOP} style={styles.headerButton}>
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
          <View style={styles.headerCentre}>
            <Text style={styles.headerTitle}>{STEP_TITLE[step]}</Text>
            {breadcrumb ? (
              <Text style={styles.breadcrumb} numberOfLines={1}>
                {breadcrumb}
              </Text>
            ) : null}
          </View>
          <Pressable onPress={close} hitSlop={HIT_SLOP} style={styles.headerButton}>
            <Ionicons name="close" size={22} color={colors.inkMuted} />
          </Pressable>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.inkFaint} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={step === 'centre' ? 'Search centres in this ward…' : 'Search…'}
            placeholderTextColor={colors.inkFaint}
            autoCorrect={false}
          />
        </View>

        {loading ? (
          <LoadingState message="Loading…" />
        ) : step === 'centre' ? (
          <FlatList
            data={centres.data ?? []}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
            ListEmptyComponent={
              <Text style={styles.empty}>No centres match.</Text>
            }
            renderItem={({ item }: { item: PollingCentreItem }) => (
              <Pressable
                style={styles.row}
                onPress={() =>
                  onSelect({ id: item.id, name: item.name, code: item.iebc_code })
                }
              >
                <View style={styles.rowBody}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowMeta}>
                    Code {item.iebc_code}
                    {item.registered_voters
                      ? ` · ${item.registered_voters.toLocaleString('en-KE')} voters`
                      : ''}
                  </Text>
                </View>
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.green} />
              </Pressable>
            )}
          />
        ) : (
          <FlatList
            data={geoItems}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
            ListEmptyComponent={<Text style={styles.empty}>Nothing matches.</Text>}
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => pickGeo(item)}>
                <View style={styles.rowBody}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowMeta}>Code {item.iebc_code}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCentre: { flex: 1, alignItems: 'center' },
  headerTitle: { ...typography.heading, color: colors.ink },
  breadcrumb: { ...typography.caption, fontSize: 12, color: colors.inkMuted },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.base,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    minHeight: MIN_TOUCH,
  },
  searchInput: { ...typography.body, color: colors.ink, flex: 1, paddingVertical: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    minHeight: MIN_TOUCH + 8,
  },
  rowBody: { flex: 1 },
  rowName: { ...typography.bodyStrong, color: colors.ink },
  rowMeta: { ...typography.caption, fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  empty: {
    ...typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
