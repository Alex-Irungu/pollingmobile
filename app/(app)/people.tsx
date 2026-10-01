/**
 * Admin: My People and Special Groups -- the ground-registration screen.
 *
 * This is the reason admin mode exists: the aspirant or coordinator is
 * standing at a funeral, a market, a baraza, and meets a supporter worth
 * recording. Name, phone, and -- the part that makes the record useful --
 * which polling centre they vote at, picked by walking County > Constituency
 * > Ward > centre search in the CentrePicker. Two taps for someone who knows
 * where they are standing.
 *
 * Special groups (boda bodas, women's groups, youth wings...) live on the
 * second segment: same registration flow, plus a rank, into a chosen group.
 *
 * CSV import/export deliberately stays on the web -- this screen is for the
 * one-at-a-time registration that happens where laptops are not.
 */

import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as api from '../../src/api/endpoints';
import type { GroupMemberItem, Person, SpecialGroupItem } from '../../src/api/types';
import { AdminHeader, HeaderAction } from '../../src/components/AdminHeader';
import { Button } from '../../src/components/Button';
import { CentrePicker, type PickedCentre } from '../../src/components/CentrePicker';
import {
  Banner,
  Card,
  EmptyState,
  LoadingState,
  SectionLabel,
  SkeletonList,
  formatNumber,
  pressedStyle,
} from '../../src/components/ui';
import * as haptics from '../../src/services/haptics';
import { HIT_SLOP, MIN_TOUCH, colors, radius, spacing, typography } from '../../src/theme';

const peopleKey = ['admin', 'people'] as const;
const peopleStatsKey = ['admin', 'peopleStats'] as const;
const groupsKey = ['admin', 'groups'] as const;

function call(phone: string) {
  Linking.openURL(`tel:${phone}`).catch(() => undefined);
}

// --------------------------------------------------------------------------- //
// Shared centre field: current assignment + button opening the picker
// --------------------------------------------------------------------------- //

function CentreField({
  centre,
  onPick,
  onClear,
}: {
  centre: PickedCentre | null;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>Polling centre</Text>
      {centre ? (
        <View style={styles.centreChosen}>
          <Ionicons name="location" size={16} color={colors.green} />
          <View style={styles.centreChosenBody}>
            <Text style={styles.centreChosenName}>{centre.name}</Text>
            <Text style={styles.centreChosenCode}>Code {centre.code}</Text>
          </View>
          <Pressable onPress={onClear} hitSlop={HIT_SLOP} accessibilityLabel="Clear centre">
            <Ionicons name="close-circle" size={20} color={colors.inkFaint} />
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.centrePickButton} onPress={onPick}>
          <Ionicons name="location-outline" size={18} color={colors.green} />
          <Text style={styles.centrePickText}>Assign a polling centre</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
        </Pressable>
      )}
    </View>
  );
}

// --------------------------------------------------------------------------- //
// Person add/edit form
// --------------------------------------------------------------------------- //

function PersonForm({
  editing,
  onClose,
}: {
  editing: Person | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [name, setName] = useState(editing?.full_name ?? '');
  const [phone, setPhone] = useState(editing?.phone_number ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [centre, setCentre] = useState<PickedCentre | null>(
    editing?.polling_centre
      ? {
          id: editing.polling_centre,
          name: editing.polling_centre_name ?? 'Assigned centre',
          code: editing.polling_centre_code ?? '',
        }
      : null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        full_name: name.trim(),
        phone_number: phone.trim(),
        email: email.trim(),
        polling_centre: centre?.id ?? null,
        notes: notes.trim(),
      };
      return editing ? api.updatePerson(editing.id, payload) : api.createPerson(payload);
    },
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: peopleKey });
      queryClient.invalidateQueries({ queryKey: peopleStatsKey });
      onClose();
    },
    onError: (err: Error) => {
      haptics.warn();
      setError(err.message);
    },
  });

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.formRoot, { paddingTop: insets.top }]}>
        <View style={styles.formHeader}>
          <Text style={styles.formTitle}>
            {editing ? 'Edit person' : 'Register a supporter'}
          </Text>
          <Pressable onPress={onClose} hitSlop={HIT_SLOP}>
            <Ionicons name="close" size={24} color={colors.inkMuted} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.formBody,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.fieldLabel}>Full name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Jane Wanjiku"
            placeholderTextColor={colors.inkFaint}
          />

          <Text style={styles.fieldLabel}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="07xx xxx xxx"
            placeholderTextColor={colors.inkFaint}
            keyboardType="phone-pad"
          />

          <Text style={styles.fieldLabel}>Email (optional)</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="name@example.com"
            placeholderTextColor={colors.inkFaint}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <CentreField
            centre={centre}
            onPick={() => setPickerOpen(true)}
            onClear={() => setCentre(null)}
          />

          <Text style={styles.fieldLabel}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder="How you met, what they can help with…"
            placeholderTextColor={colors.inkFaint}
            multiline
          />

          {error ? <Banner tone="error" message={error} /> : null}

          <View style={{ marginTop: spacing.lg }}>
            <Button
              label={editing ? 'Save changes' : 'Register'}
              onPress={() => {
                setError(null);
                if (!name.trim()) {
                  setError('A name is required.');
                  return;
                }
                save.mutate();
              }}
              loading={save.isPending}
            />
          </View>
        </ScrollView>

        <CentrePicker
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={(picked) => {
            setCentre(picked);
            setPickerOpen(false);
          }}
        />
      </View>
    </Modal>
  );
}

// --------------------------------------------------------------------------- //
// Group member add form
// --------------------------------------------------------------------------- //

function MemberForm({ group, onClose }: { group: SpecialGroupItem; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [rank, setRank] = useState('Member');
  const [centre, setCentre] = useState<PickedCentre | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.createGroupMember({
        group: group.id,
        full_name: name.trim(),
        phone_number: phone.trim(),
        rank: rank.trim() || 'Member',
        polling_centre: centre?.id ?? null,
      }),
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['admin', 'groupMembers', group.id] });
      queryClient.invalidateQueries({ queryKey: groupsKey });
      onClose();
    },
    onError: (err: Error) => {
      haptics.warn();
      setError(err.message);
    },
  });

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.formRoot, { paddingTop: insets.top }]}>
        <View style={styles.formHeader}>
          <Text style={styles.formTitle}>Add to {group.name}</Text>
          <Pressable onPress={onClose} hitSlop={HIT_SLOP}>
            <Ionicons name="close" size={24} color={colors.inkMuted} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.formBody,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.fieldLabel}>Full name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Peter Otieno"
            placeholderTextColor={colors.inkFaint}
          />

          <Text style={styles.fieldLabel}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="07xx xxx xxx"
            placeholderTextColor={colors.inkFaint}
            keyboardType="phone-pad"
          />

          <Text style={styles.fieldLabel}>Rank in the group</Text>
          <TextInput
            style={styles.input}
            value={rank}
            onChangeText={setRank}
            placeholder="Member, Chairperson, Treasurer…"
            placeholderTextColor={colors.inkFaint}
          />

          <CentreField
            centre={centre}
            onPick={() => setPickerOpen(true)}
            onClear={() => setCentre(null)}
          />

          {error ? <Banner tone="error" message={error} /> : null}

          <View style={{ marginTop: spacing.lg }}>
            <Button
              label="Add member"
              onPress={() => {
                setError(null);
                if (!name.trim()) {
                  setError('A name is required.');
                  return;
                }
                save.mutate();
              }}
              loading={save.isPending}
            />
          </View>
        </ScrollView>

        <CentrePicker
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={(picked) => {
            setCentre(picked);
            setPickerOpen(false);
          }}
        />
      </View>
    </Modal>
  );
}

// --------------------------------------------------------------------------- //
// Group detail: members list
// --------------------------------------------------------------------------- //

function GroupDetail({ group, onClose }: { group: SpecialGroupItem; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [adding, setAdding] = useState(false);

  const members = useQuery({
    queryKey: ['admin', 'groupMembers', group.id],
    queryFn: () => api.fetchGroupMembers(group.id),
    staleTime: 30_000,
  });

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.formRoot, { paddingTop: insets.top }]}>
        <View style={styles.formHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.formTitle}>{group.name}</Text>
            <Text style={styles.formSubtitle}>
              {group.category_display} · {group.member_count} members
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={HIT_SLOP}>
            <Ionicons name="close" size={24} color={colors.inkMuted} />
          </Pressable>
        </View>

        {members.isPending ? (
          <SkeletonList rows={6} />
        ) : (
          <FlatList
            data={members.data ?? []}
            keyExtractor={(m) => m.id}
            contentContainerStyle={[
              styles.formBody,
              { paddingBottom: insets.bottom + 90 },
            ]}
            ListEmptyComponent={
              <EmptyState
                title="No members yet"
                message="Add the first member below."
                icon={<Ionicons name="people-outline" size={36} color={colors.inkFaint} />}
              />
            }
            renderItem={({ item }: { item: GroupMemberItem }) => (
              <Card style={styles.personCard}>
                <View style={styles.personRow}>
                  <View style={styles.personBody}>
                    <Text style={styles.personName}>{item.full_name}</Text>
                    <Text style={styles.personMeta}>
                      {item.rank}
                      {item.polling_centre_name ? ` · ${item.polling_centre_name}` : ''}
                    </Text>
                  </View>
                  {item.phone_number ? (
                    <Pressable
                      style={pressedStyle(styles.callButton)}
                      onPress={() => {
                        haptics.tap();
                        call(item.phone_number);
                      }}
                      accessibilityLabel={`Call ${item.full_name}`}
                    >
                      <Ionicons name="call" size={18} color={colors.green} />
                    </Pressable>
                  ) : null}
                </View>
              </Card>
            )}
          />
        )}

        <View style={[styles.floatingFooter, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button label="Add member" onPress={() => setAdding(true)} />
        </View>

        {adding ? <MemberForm group={group} onClose={() => setAdding(false)} /> : null}
      </View>
    </Modal>
  );
}

// --------------------------------------------------------------------------- //
// Screen
// --------------------------------------------------------------------------- //

type Segment = 'people' | 'groups';

export default function PeopleScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [segment, setSegment] = useState<Segment>('people');
  const [search, setSearch] = useState('');
  const [personForm, setPersonForm] = useState<{ open: boolean; editing: Person | null }>({
    open: false,
    editing: null,
  });
  const [openGroup, setOpenGroup] = useState<SpecialGroupItem | null>(null);

  // One unfiltered fetch, searched in memory: every keystroke matches
  // instantly against name, phone, email, polling centre and notes, with no
  // network round trip per letter.
  const people = useQuery({
    queryKey: [...peopleKey],
    queryFn: () => api.fetchPeople(),
    staleTime: 30_000,
  });

  const needle = search.trim().toLowerCase();
  const filteredPeople = (people.data ?? []).filter((p) => {
    if (!needle) return true;
    return (
      p.full_name.toLowerCase().includes(needle) ||
      (p.phone_number ?? '').includes(needle) ||
      (p.email ?? '').toLowerCase().includes(needle) ||
      (p.polling_centre_name ?? '').toLowerCase().includes(needle) ||
      (p.notes ?? '').toLowerCase().includes(needle)
    );
  });
  const stats = useQuery({
    queryKey: peopleStatsKey,
    queryFn: api.fetchPeopleStats,
    staleTime: 60_000,
  });
  const groups = useQuery({
    queryKey: groupsKey,
    queryFn: () => api.fetchGroups(),
    staleTime: 60_000,
    enabled: segment === 'groups',
  });

  const removePerson = useMutation({
    mutationFn: api.deletePerson,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: peopleKey });
      queryClient.invalidateQueries({ queryKey: peopleStatsKey });
    },
  });

  function confirmDeletePerson(person: Person) {
    Alert.alert('Remove person', `Remove ${person.full_name} from my people?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removePerson.mutate(person.id) },
    ]);
  }

  return (
    <View style={styles.screen}>
      <AdminHeader
        kicker="GROUND NETWORK"
        title="My People"
        right={
          segment === 'people' ? (
            <HeaderAction
              icon="person-add"
              label="Register"
              onPress={() => setPersonForm({ open: true, editing: null })}
            />
          ) : undefined
        }
      />

      {/* Segment switch */}
      <View style={styles.segmentRow}>
        {(
          [
            ['people', 'People'],
            ['groups', 'Special groups'],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            style={[styles.segmentButton, segment === value && styles.segmentActive]}
            onPress={() => setSegment(value)}
          >
            <Text
              style={[styles.segmentText, segment === value && styles.segmentTextActive]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {segment === 'people' ? (
        <>
          {/* Stats strip */}
          {stats.data ? (
            <View style={styles.statsStrip}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{formatNumber(stats.data.total)}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: colors.verified }]}>
                  {formatNumber(stats.data.assigned)}
                </Text>
                <Text style={styles.statLabel}>Assigned</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: colors.pending }]}>
                  {formatNumber(stats.data.unassigned)}
                </Text>
                <Text style={styles.statLabel}>Unassigned</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.inkFaint} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Name, phone, centre, notes…"
              placeholderTextColor={colors.inkFaint}
              autoCorrect={false}
            />
          </View>

          {people.isPending ? (
            <SkeletonList rows={6} />
          ) : (
            <FlatList
              data={filteredPeople}
              keyExtractor={(p) => p.id}
              contentContainerStyle={[
                styles.list,
                { paddingBottom: insets.bottom + spacing.xxl },
              ]}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <EmptyState
                  title={search ? 'Nobody matches' : 'No people yet'}
                  message={
                    search
                      ? 'Try a different name, number or centre.'
                      : 'Record the first supporter you meet on the ground.'
                  }
                  icon={<Ionicons name="people-outline" size={40} color={colors.inkFaint} />}
                  action={
                    search
                      ? undefined
                      : {
                          label: 'Register a supporter',
                          onPress: () => setPersonForm({ open: true, editing: null }),
                        }
                  }
                />
              }
              renderItem={({ item }) => (
                <Card style={styles.personCard}>
                  <Pressable
                    onPress={() => setPersonForm({ open: true, editing: item })}
                    onLongPress={() => confirmDeletePerson(item)}
                  >
                    <View style={styles.personRow}>
                      <View style={styles.personBody}>
                        <Text style={styles.personName}>{item.full_name}</Text>
                        <Text style={styles.personMeta}>
                          {item.phone_number || 'No phone'}
                        </Text>
                        {item.polling_centre_name ? (
                          <View style={styles.centreTag}>
                            <Ionicons name="location" size={11} color={colors.green} />
                            <Text style={styles.centreTagText} numberOfLines={1}>
                              {item.polling_centre_name}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.unassignedTag}>Not assigned to a centre</Text>
                        )}
                      </View>
                      {item.phone_number ? (
                        <Pressable
                          style={pressedStyle(styles.callButton)}
                          onPress={() => {
                            haptics.tap();
                            call(item.phone_number);
                          }}
                          accessibilityLabel={`Call ${item.full_name}`}
                        >
                          <Ionicons name="call" size={18} color={colors.green} />
                        </Pressable>
                      ) : null}
                    </View>
                  </Pressable>
                </Card>
              )}
            />
          )}
        </>
      ) : groups.isPending ? (
        <SkeletonList rows={6} />
      ) : (
        <FlatList
          data={groups.data ?? []}
          keyExtractor={(g) => g.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
          ListHeaderComponent={<SectionLabel>Tap a group to view and add members</SectionLabel>}
          ListEmptyComponent={
            <EmptyState
              title="No groups yet"
              message="Create groups in the web Command Centre, then add members here from the ground."
              icon={<Ionicons name="people-circle-outline" size={40} color={colors.inkFaint} />}
            />
          }
          renderItem={({ item }) => (
            <Card style={styles.personCard}>
              <Pressable onPress={() => setOpenGroup(item)}>
                <View style={styles.personRow}>
                  <View style={styles.personBody}>
                    <Text style={styles.personName}>{item.name}</Text>
                    <Text style={styles.personMeta}>
                      {item.category_display}
                      {item.ward_name
                        ? ` · ${item.ward_name}`
                        : item.constituency_name
                          ? ` · ${item.constituency_name}`
                          : item.county_name
                            ? ` · ${item.county_name}`
                            : ''}
                    </Text>
                  </View>
                  <View style={styles.memberCount}>
                    <Text style={styles.memberCountText}>{item.member_count}</Text>
                    <Text style={styles.memberCountLabel}>members</Text>
                  </View>
                </View>
              </Pressable>
            </Card>
          )}
        />
      )}

      {personForm.open ? (
        <PersonForm
          key={personForm.editing?.id ?? 'new'}
          editing={personForm.editing}
          onClose={() => setPersonForm({ open: false, editing: null })}
        />
      ) : null}
      {openGroup ? <GroupDetail group={openGroup} onClose={() => setOpenGroup(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },

  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.base,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 3,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  segmentButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    minHeight: 40,
    justifyContent: 'center',
  },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { ...typography.label, color: colors.inkMuted },
  segmentTextActive: { color: colors.green },

  statsStrip: {
    flexDirection: 'row',
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.md,
  },
  statBox: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { ...typography.numeric, fontSize: 18, color: colors.ink },
  statLabel: { ...typography.caption, fontSize: 11, color: colors.inkMuted },

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

  list: { paddingHorizontal: spacing.base, gap: spacing.sm },
  personCard: { marginBottom: spacing.sm, paddingVertical: spacing.md },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  personBody: { flex: 1, gap: 2 },
  personName: { ...typography.bodyStrong, color: colors.ink },
  personMeta: { ...typography.caption, fontSize: 12, color: colors.inkMuted },
  centreTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  centreTagText: { ...typography.caption, fontSize: 11, color: colors.green, flexShrink: 1 },
  unassignedTag: {
    ...typography.caption,
    fontSize: 11,
    color: colors.pending,
    marginTop: 2,
  },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.greenSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberCount: { alignItems: 'center' },
  memberCountText: { ...typography.numeric, fontSize: 18, color: colors.green },
  memberCountLabel: { ...typography.caption, fontSize: 10, color: colors.inkFaint },

  formRoot: { flex: 1, backgroundColor: colors.canvas },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  formTitle: { ...typography.heading, color: colors.ink },
  formSubtitle: { ...typography.caption, fontSize: 12, color: colors.inkMuted },
  formBody: { padding: spacing.base, gap: spacing.xs },
  fieldLabel: { ...typography.label, color: colors.inkMuted, marginTop: spacing.md },
  input: {
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: MIN_TOUCH,
    marginTop: spacing.xs,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },

  centrePickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.greenSurface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: MIN_TOUCH,
    marginTop: spacing.xs,
  },
  centrePickText: { ...typography.bodyStrong, fontSize: 14, color: colors.green, flex: 1 },
  centreChosen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.verifiedSurface,
    borderWidth: 1,
    borderColor: colors.verified,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: MIN_TOUCH,
    marginTop: spacing.xs,
  },
  centreChosenBody: { flex: 1 },
  centreChosenName: { ...typography.bodyStrong, fontSize: 14, color: colors.ink },
  centreChosenCode: { ...typography.caption, fontSize: 11, color: colors.inkMuted },

  floatingFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});
