/**
 * Admin: campaign events, as an agenda.
 *
 * A month grid is the web's luxury; on a 6" screen the question is "what is
 * happening, and when is the next thing" -- so this is a chronological agenda
 * grouped by day, with a live countdown on every upcoming event and the two
 * key contacts one tap from a phone call.
 *
 * Conflicts follow the web's advisory model: while composing, the chosen time
 * window is checked against existing events and clashes are shown in amber,
 * but the save is never blocked -- whether a double-booking is acceptable is
 * the admin's call, recorded via conflict_acknowledged.
 */

import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as api from '../../src/api/endpoints';
import type { AdminEvent, AdminEventInput } from '../../src/api/types';
import { AdminHeader, HeaderAction } from '../../src/components/AdminHeader';
import { Button } from '../../src/components/Button';
import { Banner, Card, EmptyState, LoadingState, SectionLabel } from '../../src/components/ui';
import { splitMs, useNow } from '../../src/hooks/useNow';
import { HIT_SLOP, MIN_TOUCH, colors, radius, spacing, typography } from '../../src/theme';

const eventsQueryKey = ['admin', 'events'] as const;

const CATEGORIES = [
  { value: 'RALLY', label: 'Rally' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'TRAINING', label: 'Training' },
  { value: 'OUTREACH', label: 'Outreach' },
  { value: 'MEDIA', label: 'Media' },
  { value: 'LOGISTICS', label: 'Logistics' },
  { value: 'FUNDRAISER', label: 'Fundraiser' },
  { value: 'OTHER', label: 'Other' },
];

const PRIORITIES = [
  { value: 'LOW', label: 'Low' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

const pad2 = (n: number) => String(n).padStart(2, '0');

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function dayKeyOf(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** The window the agenda fetches: a week back for context, two months ahead. */
function agendaRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  const to = new Date(now.getFullYear(), now.getMonth() + 2, now.getDate());
  return { from: from.toISOString(), to: to.toISOString() };
}

// --------------------------------------------------------------------------- //
// Live countdown strip
// --------------------------------------------------------------------------- //

function CountdownStrip({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  const now = useNow();
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();

  if (now >= end) {
    return (
      <View style={[styles.countdown, styles.countdownPast]}>
        <Text style={styles.countdownPastText}>Concluded</Text>
      </View>
    );
  }

  if (now >= start) {
    const left = splitMs(end - now);
    return (
      <View style={[styles.countdown, styles.countdownLive]}>
        <View style={styles.liveDot} />
        <Text style={styles.countdownLiveText}>
          LIVE NOW · ends in{' '}
          {left.days > 0
            ? `${left.days}d ${pad2(left.hours)}h`
            : left.hours > 0
              ? `${left.hours}h ${pad2(left.minutes)}m`
              : `${pad2(left.minutes)}:${pad2(left.seconds)}`}
        </Text>
      </View>
    );
  }

  const parts = splitMs(start - now);
  const urgent = parts.days === 0;
  const segments: Array<[number, string]> =
    parts.days === 0 && parts.hours === 0
      ? [
          [parts.minutes, 'MIN'],
          [parts.seconds, 'SEC'],
        ]
      : [
          [parts.days, 'DAYS'],
          [parts.hours, 'HRS'],
          [parts.minutes, 'MIN'],
        ];

  return (
    <View style={[styles.countdown, urgent ? styles.countdownUrgent : styles.countdownAhead]}>
      <Text style={[styles.countdownLabel, urgent && styles.countdownLabelUrgent]}>
        STARTS IN
      </Text>
      <View style={styles.segments}>
        {segments.map(([value, label], i) => (
          <React.Fragment key={label}>
            {i > 0 ? <Text style={styles.segmentColon}>:</Text> : null}
            <View style={styles.segment}>
              <Text style={[styles.segmentValue, urgent && styles.segmentValueUrgent]}>
                {pad2(value)}
              </Text>
              <Text style={styles.segmentUnit}>{label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

// --------------------------------------------------------------------------- //
// Event card
// --------------------------------------------------------------------------- //

function callNumber(phone: string) {
  Linking.openURL(`tel:${phone}`).catch(() => undefined);
}

function EventCard({
  event,
  index,
  onEdit,
  onDelete,
}: {
  event: AdminEvent;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const category = CATEGORIES.find((c) => c.value === event.category)?.label ?? event.category;
  const contacts = [
    { name: event.contact1_name, phone: event.contact1_phone },
    { name: event.contact2_name, phone: event.contact2_phone },
  ].filter((c) => c.phone);

  return (
    <Card index={index} style={styles.eventCard}>
      <View style={styles.eventHeader}>
        <View style={styles.categoryPill}>
          <Text style={styles.categoryText}>{category.toUpperCase()}</Text>
        </View>
        <View style={styles.eventActions}>
          <Pressable onPress={onEdit} hitSlop={HIT_SLOP} accessibilityLabel="Edit event">
            <Ionicons name="pencil" size={18} color={colors.inkMuted} />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={HIT_SLOP} accessibilityLabel="Delete event">
            <Ionicons name="trash-outline" size={18} color={colors.rejected} />
          </Pressable>
        </View>
      </View>

      <Text style={styles.eventTitle}>{event.title}</Text>
      <Text style={styles.eventMeta}>
        {fmtTime(event.starts_at)} – {fmtTime(event.ends_at)}
        {event.location ? `  ·  ${event.location}` : ''}
      </Text>
      {event.description ? (
        <Text style={styles.eventNotes} numberOfLines={2}>
          {event.description}
        </Text>
      ) : null}

      <CountdownStrip startsAt={event.starts_at} endsAt={event.ends_at} />

      {contacts.length > 0 ? (
        <View style={styles.contactRow}>
          {contacts.map((contact) => (
            <Pressable
              key={contact.phone}
              style={styles.contactChip}
              onPress={() => callNumber(contact.phone)}
              accessibilityLabel={`Call ${contact.name || contact.phone}`}
            >
              <Ionicons name="call" size={14} color={colors.info} />
              <Text style={styles.contactText} numberOfLines={1}>
                {contact.name ? `${contact.name} · ${contact.phone}` : contact.phone}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {event.conflict_acknowledged ? (
        <View style={styles.overlapRow}>
          <Ionicons name="warning-outline" size={13} color={colors.flagged} />
          <Text style={styles.overlapText}>Overlaps another event — recorded knowingly</Text>
        </View>
      ) : null}
    </Card>
  );
}

// --------------------------------------------------------------------------- //
// Add / edit form
// --------------------------------------------------------------------------- //

/** Date and time as separate text fields: a native cross-platform datetime
 * picker is a dependency this repo does not carry, and typed `2027-08-10` /
 * `14:30` is unambiguous and fast on the simple keyboards cheap phones have. */
function parseLocal(dateText: string, timeText: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dateText.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeText.trim());
  if (!dateMatch || !timeMatch) return null;
  const [, y, m, d] = dateMatch.map(Number);
  const [, hh, mm] = timeMatch.map(Number);
  if (hh > 23 || mm > 59) return null;
  const result = new Date(y, m - 1, d, hh, mm, 0);
  return Number.isNaN(result.getTime()) ? null : result;
}

function toDateText(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function EventForm({
  visible,
  editing,
  onClose,
}: {
  visible: boolean;
  editing: AdminEvent | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const today = new Date();
  const todayText = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

  const [title, setTitle] = useState(editing?.title ?? '');
  const [category, setCategory] = useState(editing?.category ?? 'MEETING');
  const [priority, setPriority] = useState(editing?.priority ?? 'NORMAL');
  const [location, setLocation] = useState(editing?.location ?? '');
  const [notes, setNotes] = useState(editing?.description ?? '');
  const [dateText, setDateText] = useState(editing ? toDateText(editing.starts_at) : todayText);
  const [startText, setStartText] = useState(editing ? fmtTime(editing.starts_at) : '09:00');
  const [endText, setEndText] = useState(editing ? fmtTime(editing.ends_at) : '10:00');
  const [c1Name, setC1Name] = useState(editing?.contact1_name ?? '');
  const [c1Phone, setC1Phone] = useState(editing?.contact1_phone ?? '');
  const [c2Name, setC2Name] = useState(editing?.contact2_name ?? '');
  const [c2Phone, setC2Phone] = useState(editing?.contact2_phone ?? '');
  const [error, setError] = useState<string | null>(null);

  const starts = parseLocal(dateText, startText);
  const ends = parseLocal(dateText, endText);
  const timesValid = !!starts && !!ends && ends.getTime() > starts.getTime();

  const conflicts = useQuery({
    queryKey: [
      'admin',
      'eventConflicts',
      starts?.toISOString() ?? '',
      ends?.toISOString() ?? '',
      editing?.id ?? '',
    ],
    queryFn: () =>
      api.checkEventConflicts(starts!.toISOString(), ends!.toISOString(), editing?.id),
    enabled: visible && timesValid,
    staleTime: 5_000,
    retry: false,
  });
  const clashes = conflicts.data?.conflicts ?? [];

  const save = useMutation({
    mutationFn: (payload: AdminEventInput) =>
      editing ? api.updateAdminEvent(editing.id, payload) : api.createAdminEvent(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventsQueryKey });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  function submit() {
    setError(null);
    if (!title.trim()) {
      setError('Give the event a title.');
      return;
    }
    if (!timesValid) {
      setError('Check the date (YYYY-MM-DD) and times (HH:MM) — the event must end after it starts.');
      return;
    }
    save.mutate({
      title: title.trim(),
      description: notes.trim(),
      location: location.trim(),
      category,
      priority,
      starts_at: starts!.toISOString(),
      ends_at: ends!.toISOString(),
      contact1_name: c1Name.trim(),
      contact1_phone: c1Phone.trim(),
      contact2_name: c2Name.trim(),
      contact2_phone: c2Phone.trim(),
      conflict_acknowledged: clashes.length > 0,
    });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.formRoot, { paddingTop: insets.top }]}>
        <View style={styles.formHeader}>
          <Text style={styles.formTitle}>{editing ? 'Edit event' : 'New event'}</Text>
          <Pressable onPress={onClose} hitSlop={HIT_SLOP}>
            <Ionicons name="close" size={24} color={colors.inkMuted} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.formBody, { paddingBottom: insets.bottom + spacing.xxl }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Rally at Afraha Stadium"
            placeholderTextColor={colors.inkFaint}
            maxLength={200}
          />

          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c.value}
                style={[styles.chip, category === c.value && styles.chipActive]}
                onPress={() => setCategory(c.value)}
              >
                <Text style={[styles.chipText, category === c.value && styles.chipTextActive]}>
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Priority</Text>
          <View style={styles.chipRow}>
            {PRIORITIES.map((p) => (
              <Pressable
                key={p.value}
                style={[styles.chip, priority === p.value && styles.chipActive]}
                onPress={() => setPriority(p.value)}
              >
                <Text style={[styles.chipText, priority === p.value && styles.chipTextActive]}>
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={dateText}
            onChangeText={setDateText}
            placeholder={todayText}
            placeholderTextColor={colors.inkFaint}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
          />

          <View style={styles.twoCol}>
            <View style={styles.col}>
              <Text style={styles.fieldLabel}>Starts (HH:MM)</Text>
              <TextInput
                style={styles.input}
                value={startText}
                onChangeText={setStartText}
                placeholder="09:00"
                placeholderTextColor={colors.inkFaint}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.fieldLabel}>Ends (HH:MM)</Text>
              <TextInput
                style={styles.input}
                value={endText}
                onChangeText={setEndText}
                placeholder="10:00"
                placeholderTextColor={colors.inkFaint}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Location</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="Venue or area (optional)"
            placeholderTextColor={colors.inkFaint}
            maxLength={200}
          />

          <Text style={styles.fieldLabel}>Key contacts</Text>
          <View style={styles.twoCol}>
            <TextInput
              style={[styles.input, styles.col]}
              value={c1Name}
              onChangeText={setC1Name}
              placeholder="Contact 1 — name"
              placeholderTextColor={colors.inkFaint}
            />
            <TextInput
              style={[styles.input, styles.col]}
              value={c1Phone}
              onChangeText={setC1Phone}
              placeholder="Phone"
              placeholderTextColor={colors.inkFaint}
              keyboardType="phone-pad"
            />
          </View>
          <View style={styles.twoCol}>
            <TextInput
              style={[styles.input, styles.col]}
              value={c2Name}
              onChangeText={setC2Name}
              placeholder="Contact 2 — name"
              placeholderTextColor={colors.inkFaint}
            />
            <TextInput
              style={[styles.input, styles.col]}
              value={c2Phone}
              onChangeText={setC2Phone}
              placeholder="Phone"
              placeholderTextColor={colors.inkFaint}
              keyboardType="phone-pad"
            />
          </View>

          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Agenda, attendees, logistics… (optional)"
            placeholderTextColor={colors.inkFaint}
            multiline
          />

          {timesValid && clashes.length > 0 ? (
            <Banner
              tone="warning"
              title={`Clashes with ${clashes.length} scheduled event${clashes.length > 1 ? 's' : ''}`}
              message={clashes
                .slice(0, 3)
                .map((c) => `${c.title} (${fmtTime(c.starts_at)}–${fmtTime(c.ends_at)})`)
                .join('\n')}
            />
          ) : null}

          {error ? <Banner tone="error" message={error} /> : null}

          <View style={{ marginTop: spacing.lg }}>
            <Button
              label={
                clashes.length > 0
                  ? editing
                    ? 'Save anyway'
                    : 'Record anyway'
                  : editing
                    ? 'Save changes'
                    : 'Record event'
              }
              onPress={submit}
              loading={save.isPending}
              disabled={!title.trim()}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// --------------------------------------------------------------------------- //
// Screen
// --------------------------------------------------------------------------- //

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{ open: boolean; editing: AdminEvent | null }>({
    open: false,
    editing: null,
  });

  const range = useMemo(agendaRange, []);
  const query = useQuery({
    queryKey: eventsQueryKey,
    queryFn: () => api.fetchAdminEvents(range.from, range.to),
    staleTime: 30_000,
  });

  const remove = useMutation({
    mutationFn: api.deleteAdminEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventsQueryKey }),
  });

  function confirmDelete(event: AdminEvent) {
    Alert.alert('Delete event', `Remove "${event.title}" from the calendar?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(event.id) },
    ]);
  }

  // Group by day, upcoming first; days already fully past sink to the bottom.
  const sections = useMemo(() => {
    const events = (query.data?.results ?? [])
      .slice()
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    const byDay = new Map<string, AdminEvent[]>();
    for (const event of events) {
      const key = dayKeyOf(event.starts_at);
      const bucket = byDay.get(key);
      if (bucket) bucket.push(event);
      else byDay.set(key, [event]);
    }
    const todayKey = dayKeyOf(new Date().toISOString());
    const entries = [...byDay.entries()];
    const current = entries.filter(([key]) => key >= todayKey);
    const past = entries.filter(([key]) => key < todayKey).reverse();
    return { current, past };
  }, [query.data]);

  if (query.isPending) return <LoadingState message="Loading events…" />;

  const isEmpty = sections.current.length === 0 && sections.past.length === 0;

  return (
    <View style={styles.screen}>
      <AdminHeader
        kicker="CAMPAIGN CALENDAR"
        title="Events"
        right={
          <HeaderAction
            icon="add"
            label="Add"
            onPress={() => setForm({ open: true, editing: null })}
          />
        }
      />

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => query.refetch()}
            tintColor={colors.green}
          />
        }
      >
        {isEmpty ? (
          <EmptyState
            title="Nothing scheduled"
            message="Tap + to record the campaign's first event."
            icon={<Ionicons name="calendar-outline" size={40} color={colors.inkFaint} />}
          />
        ) : (
          <>
            {sections.current.map(([key, events]) => (
              <View key={key} style={styles.daySection}>
                <SectionLabel>{dayLabel(events[0].starts_at)}</SectionLabel>
                {events.map((event, i) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    index={i}
                    onEdit={() => setForm({ open: true, editing: event })}
                    onDelete={() => confirmDelete(event)}
                  />
                ))}
              </View>
            ))}
            {sections.past.length > 0 ? (
              <View style={styles.daySection}>
                <SectionLabel>Past events</SectionLabel>
                {sections.past.flatMap(([, events]) =>
                  events.map((event, i) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      index={i}
                      onEdit={() => setForm({ open: true, editing: event })}
                      onDelete={() => confirmDelete(event)}
                    />
                  )),
                )}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {form.open ? (
        <EventForm
          key={form.editing?.id ?? 'new'}
          visible={form.open}
          editing={form.editing}
          onClose={() => setForm({ open: false, editing: null })}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  list: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  daySection: { gap: spacing.sm },

  eventCard: { gap: spacing.sm, marginBottom: spacing.sm },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryPill: {
    backgroundColor: colors.greenSurface,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  categoryText: { ...typography.micro, color: colors.green },
  eventActions: { flexDirection: 'row', gap: spacing.lg },
  eventTitle: { ...typography.heading, color: colors.ink },
  eventMeta: { ...typography.caption, color: colors.inkMuted },
  eventNotes: { ...typography.caption, color: colors.inkFaint, lineHeight: 18 },

  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
  },
  countdownAhead: { backgroundColor: colors.greenSurface, borderColor: colors.line },
  countdownUrgent: { backgroundColor: colors.goldSurface, borderColor: colors.goldLight },
  countdownLive: { backgroundColor: colors.verifiedSurface, borderColor: colors.verified },
  countdownPast: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.line,
    justifyContent: 'center',
  },
  countdownLabel: { ...typography.micro, color: colors.green },
  countdownLabelUrgent: { color: colors.pending },
  countdownPastText: { ...typography.caption, fontSize: 12, color: colors.inkFaint },
  countdownLiveText: { ...typography.label, fontSize: 12, color: colors.verified },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.verified },
  segments: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  segment: { alignItems: 'center', minWidth: 34 },
  segmentValue: { ...typography.numeric, fontSize: 18, color: colors.green },
  segmentValueUrgent: { color: colors.pending },
  segmentUnit: { ...typography.micro, fontSize: 9, color: colors.inkFaint },
  segmentColon: { ...typography.numeric, fontSize: 16, color: colors.inkFaint },

  contactRow: { gap: spacing.sm },
  contactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.infoSurface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-start',
    minHeight: 36,
  },
  contactText: { ...typography.label, fontSize: 12, color: colors.info },
  overlapRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  overlapText: { ...typography.caption, fontSize: 11, color: colors.flagged },

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
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  twoCol: { flexDirection: 'row', gap: spacing.sm },
  col: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.green, borderColor: colors.green },
  chipText: { ...typography.label, fontSize: 12, color: colors.inkMuted },
  chipTextActive: { color: colors.white },
});
