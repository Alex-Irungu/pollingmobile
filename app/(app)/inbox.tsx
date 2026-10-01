/**
 * Admin: the command-centre inbox, from a phone.
 *
 * Every agent thread, most recent first, unread counts in brand gold; tap a
 * thread to read it (which marks it read server-side, same as the web) and
 * reply with text. Photo/voice composition stays on the web -- the admin in
 * the field needs "answer the agent now", not a full media console.
 *
 * Polling cadences copy the agent app's reasoning: 20s on the inbox list,
 * 6s inside an open thread, because someone with a thread open is waiting.
 */

import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as api from '../../src/api/endpoints';
import type {
  AgentListItem,
  ChatMessage,
  InboxConversation,
  SpecialGroupItem,
} from '../../src/api/types';
import { AdminHeader, HeaderAction } from '../../src/components/AdminHeader';
import { Button } from '../../src/components/Button';
import { EmptyState, LoadingState, SkeletonList, pressedStyle } from '../../src/components/ui';
import * as haptics from '../../src/services/haptics';
import { HIT_SLOP, MIN_TOUCH, colors, radius, spacing, typography } from '../../src/theme';

const INBOX_POLL_MS = 20_000;
const THREAD_POLL_MS = 6_000;

/** Same fallback-safe UUID as the message outbox (Hermes lacks
 * crypto.randomUUID on some versions). */
function newUuid(): string {
  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

/** Deterministic avatar colour from the agent's name, so a long inbox is
 * scannable by colour before it is readable by text. */
const AVATAR_PALETTE = [
  { bg: colors.greenSurface, fg: colors.green },
  { bg: colors.infoSurface, fg: colors.info },
  { bg: colors.goldSurface, fg: colors.gold },
  { bg: colors.verifiedSurface, fg: colors.verified },
  { bg: colors.pendingSurface, fg: colors.pending },
  { bg: colors.flaggedSurface, fg: colors.flagged },
];

function avatarColour(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function fmtWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
}

// --------------------------------------------------------------------------- //
// Thread view
// --------------------------------------------------------------------------- //

function ThreadView({
  conversation,
  onClose,
}: {
  conversation: InboxConversation;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const thread = useQuery({
    queryKey: ['admin', 'thread', conversation.id],
    queryFn: () => api.fetchThread(conversation.id),
    refetchInterval: THREAD_POLL_MS,
    refetchIntervalInBackground: false,
  });

  const send = useMutation({
    mutationFn: (body: string) =>
      api.sendThreadMessage(conversation.id, {
        body,
        client_uuid: newUuid(),
      }),
    onSuccess: () => {
      haptics.success();
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'thread', conversation.id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'inbox'] });
    },
    onError: () => haptics.warn(),
  });

  const messages = thread.data?.results ?? [];

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.threadRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.threadHeader, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable onPress={onClose} hitSlop={HIT_SLOP} style={styles.headerButton}>
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
          <View style={styles.threadHeaderBody}>
            <Text style={styles.threadName} numberOfLines={1}>
              {conversation.agent_name}
            </Text>
            {conversation.polling_station ? (
              <Text style={styles.threadStation} numberOfLines={1}>
                {conversation.polling_station}
              </Text>
            ) : null}
          </View>
          {conversation.agent_phone ? (
            <Pressable
              onPress={() =>
                Linking.openURL(`tel:${conversation.agent_phone}`).catch(() => undefined)
              }
              hitSlop={HIT_SLOP}
              style={styles.headerCall}
              accessibilityLabel={`Call ${conversation.agent_name}`}
            >
              <Ionicons name="call" size={18} color={colors.white} />
            </Pressable>
          ) : null}
        </View>

        {thread.isPending ? (
          <LoadingState message="Loading conversation…" />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.threadList}
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: false })
            }
            renderItem={({ item }) => {
              // from_agent=true means the field agent wrote it; our own
              // (command centre) messages sit on the right in brand green.
              const mine = !item.from_agent;
              return (
                <View
                  style={[styles.bubbleRow, mine ? styles.bubbleRowMine : null]}
                >
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    {!mine && item.sender_name ? (
                      <Text style={styles.bubbleSender}>{item.sender_name}</Text>
                    ) : null}
                    <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
                      {item.kind === 'TEXT'
                        ? item.body
                        : item.kind === 'IMAGE'
                          ? '📷 Photo (view on the web)'
                          : item.kind === 'AUDIO'
                            ? '🎙 Voice note (listen on the web)'
                            : item.body}
                    </Text>
                    <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                      {fmtWhen(item.created_at)}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        <View
          style={[
            styles.composer,
            { paddingBottom: Math.max(insets.bottom, spacing.sm) },
          ]}
        >
          <TextInput
            style={styles.composerInput}
            value={draft}
            onChangeText={setDraft}
            placeholder={`Message ${conversation.agent_name.split(' ')[0]}…`}
            placeholderTextColor={colors.inkFaint}
            multiline
          />
          <Pressable
            style={[styles.sendButton, (!draft.trim() || send.isPending) && styles.sendDisabled]}
            disabled={!draft.trim() || send.isPending}
            onPress={() => send.mutate(draft.trim())}
            accessibilityLabel="Send message"
          >
            <Ionicons name="send" size={18} color={colors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// --------------------------------------------------------------------------- //
// Broadcast composer: one message to many, same audiences as the web
// --------------------------------------------------------------------------- //

const BROADCAST_MAX = 1000;

type Audience = 'ALL_AGENTS' | 'AGENTS' | 'GROUPS';

const AUDIENCES: Array<{ value: Audience; label: string; hint: string }> = [
  { value: 'ALL_AGENTS', label: 'All agents', hint: 'Every active agent in the field' },
  { value: 'AGENTS', label: 'Specific agents', hint: 'Pick who should get it' },
  { value: 'GROUPS', label: 'Special groups', hint: 'Boda bodas, women\u2019s groups\u2026' },
];

function BroadcastComposer({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('ALL_AGENTS');
  const [agentIds, setAgentIds] = useState<Set<string>>(new Set());
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set());
  const [pickerSearch, setPickerSearch] = useState('');

  const agents = useQuery({
    queryKey: ['admin', 'agents'],
    queryFn: api.fetchAgents,
    staleTime: 60_000,
    enabled: audience === 'AGENTS',
  });
  const groups = useQuery({
    queryKey: ['admin', 'groups'],
    queryFn: () => api.fetchGroups(),
    staleTime: 60_000,
    enabled: audience === 'GROUPS',
  });

  const send = useMutation({
    mutationFn: () =>
      api.sendBroadcast({
        body: body.trim(),
        audience,
        agent_ids: audience === 'AGENTS' ? [...agentIds] : undefined,
        group_ids: audience === 'GROUPS' ? [...groupIds] : undefined,
      }),
    onSuccess: (result) => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['admin', 'inbox'] });
      onClose();
      const lines = [`Delivered in-app to ${result.delivered_in_app} agent${result.delivered_in_app === 1 ? '' : 's'}.`];
      if (result.sms_pending > 0) {
        lines.push(
          `${result.sms_pending} group member${result.sms_pending === 1 ? ' has' : 's have'} no app account \u2014 reachable by SMS once the SMS gateway is connected.`,
        );
      }
      Alert.alert('Message sent', lines.join('\n\n'));
    },
    onError: (err: Error) => {
      haptics.warn();
      Alert.alert('Could not send', err.message);
    },
  });

  function toggle(set: Set<string>, id: string, apply: (next: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  }

  // Only active agents can receive a broadcast; showing the rest would
  // promise delivery the backend will not make.
  const needle = pickerSearch.trim().toLowerCase();
  const pickableAgents = (agents.data ?? []).filter(
    (a) =>
      a.status === 'ACTIVE' &&
      (!needle ||
        a.full_name.toLowerCase().includes(needle) ||
        a.phone_number.includes(needle) ||
        (a.location ?? '').toLowerCase().includes(needle)),
  );
  const pickableGroups = (groups.data ?? []).filter(
    (g) => !needle || g.name.toLowerCase().includes(needle),
  );

  const recipientsChosen =
    audience === 'ALL_AGENTS' ||
    (audience === 'AGENTS' && agentIds.size > 0) ||
    (audience === 'GROUPS' && groupIds.size > 0);
  const canSend = body.trim().length > 0 && recipientsChosen && !send.isPending;

  const selectionSummary =
    audience === 'ALL_AGENTS'
      ? 'Goes to every active agent'
      : audience === 'AGENTS'
        ? `${agentIds.size} agent${agentIds.size === 1 ? '' : 's'} selected`
        : `${groupIds.size} group${groupIds.size === 1 ? '' : 's'} selected`;

  const header = (
    <View style={styles.composerTop}>
      <Text style={styles.fieldLabel}>Message</Text>
      <TextInput
        style={styles.bodyInput}
        value={body}
        onChangeText={(text) => setBody(text.slice(0, BROADCAST_MAX))}
        placeholder="Type the message every recipient will see…"
        placeholderTextColor={colors.inkFaint}
        multiline
      />
      <Text style={styles.charCount}>
        {body.length}/{BROADCAST_MAX}
      </Text>

      <Text style={styles.fieldLabel}>Send to</Text>
      <View style={styles.audienceColumn}>
        {AUDIENCES.map((option) => {
          const active = audience === option.value;
          return (
            <Pressable
              key={option.value}
              style={[styles.audienceRow, active && styles.audienceRowActive]}
              onPress={() => {
                setAudience(option.value);
                setPickerSearch('');
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <Ionicons
                name={active ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={active ? colors.green : colors.inkFaint}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.audienceLabel, active && { color: colors.green }]}>
                  {option.label}
                </Text>
                <Text style={styles.audienceHint}>{option.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {audience !== 'ALL_AGENTS' ? (
        <View style={styles.pickerSearch}>
          <Ionicons name="search" size={15} color={colors.inkFaint} />
          <TextInput
            style={styles.pickerSearchInput}
            value={pickerSearch}
            onChangeText={setPickerSearch}
            placeholder={
              audience === 'AGENTS' ? 'Search name, phone, station\u2026' : 'Search groups\u2026'
            }
            placeholderTextColor={colors.inkFaint}
            autoCorrect={false}
          />
        </View>
      ) : null}

      {(audience === 'AGENTS' && agents.isPending) ||
      (audience === 'GROUPS' && groups.isPending) ? (
        <Text style={styles.pickerLoading}>Loading…</Text>
      ) : null}
    </View>
  );

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.composerRoot}>
        <View style={[styles.composerHeader, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable onPress={onClose} hitSlop={HIT_SLOP} style={styles.headerButton}>
            <Ionicons name="close" size={24} color={colors.inkMuted} />
          </Pressable>
          <Text style={styles.composerTitle}>New message</Text>
          <View style={{ width: MIN_TOUCH }} />
        </View>

        {audience === 'AGENTS' ? (
          <FlatList
            data={pickableAgents}
            keyExtractor={(a) => a.id}
            ListHeaderComponent={header}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.composerBody}
            renderItem={({ item }: { item: AgentListItem }) => {
              const selected = agentIds.has(item.id);
              return (
                <Pressable
                  style={[styles.pickRow, selected && styles.pickRowSelected]}
                  onPress={() => toggle(agentIds, item.id, setAgentIds)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                >
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={selected ? colors.green : colors.inkFaint}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickName}>{item.full_name}</Text>
                    <Text style={styles.pickMeta} numberOfLines={1}>
                      {item.phone_number}
                      {item.location ? ` \u00b7 ${item.location}` : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
          />
        ) : audience === 'GROUPS' ? (
          <FlatList
            data={pickableGroups}
            keyExtractor={(g) => g.id}
            ListHeaderComponent={header}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.composerBody}
            renderItem={({ item }: { item: SpecialGroupItem }) => {
              const selected = groupIds.has(item.id);
              return (
                <Pressable
                  style={[styles.pickRow, selected && styles.pickRowSelected]}
                  onPress={() => toggle(groupIds, item.id, setGroupIds)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                >
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={selected ? colors.green : colors.inkFaint}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickName}>{item.name}</Text>
                    <Text style={styles.pickMeta}>
                      {item.category_display} · {item.member_count} members
                    </Text>
                  </View>
                </Pressable>
              );
            }}
          />
        ) : (
          <FlatList
            data={[]}
            renderItem={null}
            ListHeaderComponent={header}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.composerBody}
          />
        )}

        <View style={[styles.composerFooter, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.selectionSummary}>{selectionSummary}</Text>
          <Button
            label={send.isPending ? 'Sending\u2026' : 'Send message'}
            onPress={() => send.mutate()}
            loading={send.isPending}
            disabled={!canSend}
          />
        </View>
      </View>
    </Modal>
  );
}

// --------------------------------------------------------------------------- //
// Inbox list
// --------------------------------------------------------------------------- //

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [openThread, setOpenThread] = useState<InboxConversation | null>(null);
  const [composing, setComposing] = useState(false);

  const inbox = useQuery({
    queryKey: ['admin', 'inbox'],
    queryFn: api.fetchInbox,
    refetchInterval: INBOX_POLL_MS,
    refetchIntervalInBackground: false,
  });

  const needle = search.trim().toLowerCase();
  const conversations = (inbox.data?.results ?? []).filter(
    (c) =>
      !needle ||
      c.agent_name.toLowerCase().includes(needle) ||
      c.agent_phone.includes(needle) ||
      (c.polling_station ?? '').toLowerCase().includes(needle),
  );

  return (
    <View style={styles.screen}>
      <AdminHeader
        kicker="COMMUNICATIONS"
        title="Messages"
        onBack={() => router.back()}
        right={<HeaderAction icon="create" label="New" onPress={() => setComposing(true)} />}
      />

      <View style={[styles.searchBox, { marginTop: spacing.md }]}>
        <Ionicons name="search" size={16} color={colors.inkFaint} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Agent name, phone or station…"
          placeholderTextColor={colors.inkFaint}
          autoCorrect={false}
        />
      </View>

      {inbox.isPending ? (
        <SkeletonList rows={7} />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
          refreshControl={
            <RefreshControl
              refreshing={inbox.isRefetching}
              onRefresh={() => inbox.refetch()}
              tintColor={colors.green}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={needle ? 'No threads match' : 'No conversations yet'}
              message={
                needle
                  ? 'Try a different name or station.'
                  : 'Threads appear when agents write in, or when the command centre writes to them.'
              }
              icon={
                <Ionicons name="chatbubbles-outline" size={40} color={colors.inkFaint} />
              }
              action={
                needle ? undefined : { label: 'New message', onPress: () => setComposing(true) }
              }
            />
          }
          renderItem={({ item }) => {
            const palette = avatarColour(item.agent_name);
            return (
            <Pressable
              style={pressedStyle(styles.convRow)}
              onPress={() => {
                haptics.tap();
                setOpenThread(item);
              }}
            >
              <View style={[styles.avatar, { backgroundColor: palette.bg }]}>
                <Text style={[styles.avatarText, { color: palette.fg }]}>
                  {item.agent_name
                    .split(' ')
                    .slice(0, 2)
                    .map((part) => part[0] ?? '')
                    .join('')
                    .toUpperCase()}
                </Text>
              </View>
              <View style={styles.convBody}>
                <View style={styles.convTop}>
                  <Text style={styles.convName} numberOfLines={1}>
                    {item.agent_name}
                  </Text>
                  <Text style={styles.convWhen}>{fmtWhen(item.last_message_at)}</Text>
                </View>
                {item.polling_station ? (
                  <Text style={styles.convStation} numberOfLines={1}>
                    {item.polling_station}
                  </Text>
                ) : null}
                <Text
                  style={[styles.convPreview, item.unread > 0 && styles.convPreviewUnread]}
                  numberOfLines={1}
                >
                  {item.last_message_preview || 'No messages yet'}
                </Text>
              </View>
              {item.unread > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>
                    {item.unread > 99 ? '99+' : item.unread}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            );
          }}
        />
      )}

      {openThread ? (
        <ThreadView conversation={openThread} onClose={() => setOpenThread(null)} />
      ) : null}
      {composing ? <BroadcastComposer onClose={() => setComposing(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },

  composerRoot: { flex: 1, backgroundColor: colors.canvas },
  composerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  composerTitle: { ...typography.heading, color: colors.ink },
  composerTop: { gap: spacing.xs, paddingBottom: spacing.sm },
  composerBody: { padding: spacing.base, paddingBottom: spacing.xxl },
  fieldLabel: { ...typography.label, color: colors.inkMuted, marginTop: spacing.md },
  bodyInput: {
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 110,
    textAlignVertical: 'top',
    marginTop: spacing.xs,
  },
  charCount: {
    ...typography.caption,
    fontSize: 11,
    color: colors.inkFaint,
    alignSelf: 'flex-end',
  },
  audienceColumn: { gap: spacing.sm, marginTop: spacing.xs },
  audienceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: MIN_TOUCH,
  },
  audienceRowActive: { borderColor: colors.green, backgroundColor: colors.greenSurface },
  audienceLabel: { ...typography.bodyStrong, fontSize: 14, color: colors.ink },
  audienceHint: { ...typography.caption, fontSize: 11, color: colors.inkFaint },
  pickerSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    marginTop: spacing.md,
  },
  pickerSearchInput: { ...typography.body, color: colors.ink, flex: 1, paddingVertical: 8 },
  pickerLoading: { ...typography.caption, color: colors.inkFaint, marginTop: spacing.sm },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    minHeight: MIN_TOUCH,
  },
  pickRowSelected: { borderColor: colors.green, backgroundColor: colors.greenSurface },
  pickName: { ...typography.bodyStrong, fontSize: 14, color: colors.ink },
  pickMeta: { ...typography.caption, fontSize: 12, color: colors.inkMuted },
  composerFooter: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: spacing.sm,
  },
  selectionSummary: {
    ...typography.caption,
    fontSize: 12,
    color: colors.inkMuted,
    textAlign: 'center',
  },

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

  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.sm,
    minHeight: MIN_TOUCH + 16,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.greenSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.label, color: colors.green },
  convBody: { flex: 1, gap: 1 },
  convTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  convName: { ...typography.bodyStrong, fontSize: 14, color: colors.ink, flexShrink: 1 },
  convWhen: { ...typography.caption, fontSize: 11, color: colors.inkFaint },
  convStation: { ...typography.caption, fontSize: 11, color: colors.inkMuted },
  convPreview: { ...typography.caption, fontSize: 13, color: colors.inkMuted },
  convPreviewUnread: { color: colors.ink, fontWeight: '600' },
  unreadBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { ...typography.micro, fontSize: 11, color: colors.white },

  threadRoot: { flex: 1, backgroundColor: colors.canvas },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
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
  threadHeaderBody: { flex: 1 },
  threadName: { ...typography.heading, color: colors.ink },
  threadStation: { ...typography.caption, fontSize: 12, color: colors.inkMuted },
  headerCall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  threadList: { padding: spacing.base, gap: spacing.sm },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '82%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  bubbleMine: { backgroundColor: colors.green },
  bubbleSender: { ...typography.micro, fontSize: 10, color: colors.inkFaint },
  bubbleText: { ...typography.body, color: colors.ink, lineHeight: 20 },
  bubbleTextMine: { color: colors.white },
  bubbleTime: { ...typography.caption, fontSize: 10, color: colors.inkFaint, alignSelf: 'flex-end' },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.7)' },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  composerInput: {
    ...typography.body,
    color: colors.ink,
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: MIN_TOUCH,
  },
  sendButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: MIN_TOUCH / 2,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
});
