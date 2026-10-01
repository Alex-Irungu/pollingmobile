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
import type { ChatMessage, InboxConversation } from '../../src/api/types';
import { EmptyState, LoadingState } from '../../src/components/ui';
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
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'thread', conversation.id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'inbox'] });
    },
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
// Inbox list
// --------------------------------------------------------------------------- //

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [openThread, setOpenThread] = useState<InboxConversation | null>(null);

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
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={HIT_SLOP}
          style={styles.backButton}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>COMMUNICATIONS</Text>
          <Text style={styles.title}>Messages</Text>
        </View>
      </View>

      <View style={styles.searchBox}>
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
        <LoadingState message="Loading inbox…" />
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
            />
          }
          renderItem={({ item }) => (
            <Pressable style={styles.convRow} onPress={() => setOpenThread(item)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
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
          )}
        />
      )}

      {openThread ? (
        <ThreadView conversation={openThread} onClose={() => setOpenThread(null)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  kicker: { ...typography.micro, color: colors.inkFaint },
  title: { ...typography.title, color: colors.ink },
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
