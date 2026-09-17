/**
 * A chat message bubble.
 *
 * Follows the conventions people already know from WhatsApp, because agents
 * should not have to learn a new chat idiom on election night: own messages
 * right-aligned and tinted, others left-aligned and white, time in the corner,
 * tails on the outer edge.
 *
 * Voice notes are play/pause with a duration rather than a scrubbable
 * waveform. A waveform needs the whole file decoded before it can be drawn,
 * which on a slow connection means staring at a blank bubble.
 */

import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInRight, FadeInLeft } from 'react-native-reanimated';

import type { ChatMessage } from '../api/types';
import { colors, radius, shadow, spacing, typography } from '../theme';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-KE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDuration(ms: number | null): string {
  if (!ms) return '0:00';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Voice-note player. */
function AudioBubble({ url, durationMs }: { url: string; durationMs: number | null }) {
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);

  const playing = status.playing;
  const position = status.currentTime ?? 0;
  const total = (status.duration ?? (durationMs ? durationMs / 1000 : 0)) || 0;
  const fraction = total > 0 ? Math.min(position / total, 1) : 0;

  return (
    <View style={styles.audioRow}>
      <Pressable
        onPress={() => {
          if (playing) {
            player.pause();
          } else {
            // Restart from the beginning once finished, so a second tap
            // replays rather than doing nothing.
            if (total > 0 && position >= total - 0.15) player.seekTo(0);
            player.play();
          }
        }}
        style={styles.audioButton}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause voice note' : 'Play voice note'}
      >
        <Ionicons name={playing ? 'pause' : 'play'} size={17} color={colors.white} />
      </Pressable>

      <View style={styles.audioTrackWrap}>
        <View style={styles.audioTrack}>
          <View style={[styles.audioProgress, { width: `${fraction * 100}%` }]} />
        </View>
        <Text style={styles.audioDuration}>
          {playing || position > 0
            ? formatDuration(position * 1000)
            : formatDuration(durationMs ?? total * 1000)}
        </Text>
      </View>
    </View>
  );
}

function ChatBubbleImpl({ message }: { message: ChatMessage }) {
  const [lightbox, setLightbox] = useState(false);
  const own = message.from_agent;
  // An optimistic bubble, not yet acknowledged by the server.
  const pending = message.id.startsWith('pending-');

  if (message.kind === 'SYSTEM') {
    return (
      <Animated.View entering={FadeIn.duration(200)} style={styles.systemWrap}>
        <Text style={styles.systemText}>{message.body}</Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={own ? FadeInRight.duration(200) : FadeInLeft.duration(200)}
      style={[styles.row, own ? styles.rowOwn : styles.rowOther]}
    >
      <View
        style={[
          styles.bubble,
          own ? styles.bubbleOwn : styles.bubbleOther,
          pending && styles.bubblePending,
        ]}
      >
        {!own ? <Text style={styles.senderName}>{message.sender_name}</Text> : null}

        {message.kind === 'IMAGE' && message.attachment ? (
          <Pressable onPress={() => setLightbox(true)} accessibilityRole="imagebutton">
            <Image
              source={{ uri: message.attachment.url }}
              style={styles.image}
              contentFit="cover"
              transition={180}
            />
          </Pressable>
        ) : null}

        {message.kind === 'AUDIO' && message.attachment ? (
          <AudioBubble
            url={message.attachment.url}
            durationMs={message.attachment.duration_ms}
          />
        ) : null}

        {message.kind === 'AUDIO' && !message.attachment && pending ? (
          <View style={styles.audioRow}>
            <ActivityIndicator size="small" color={colors.green} />
            <Text style={styles.uploadingText}>Sending voice note...</Text>
          </View>
        ) : null}

        {message.body ? (
          <Text style={[styles.body, own ? styles.bodyOwn : styles.bodyOther]}>
            {message.body}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          <Text style={styles.time}>{formatTime(message.created_at)}</Text>
          {own ? (
            pending ? (
              <Ionicons name="time-outline" size={13} color={colors.inkFaint} />
            ) : (
              // Single tick = the server has it. Double = the command centre
              // has read it. Same meaning people already expect.
              <Ionicons
                name={message.read_at ? 'checkmark-done' : 'checkmark'}
                size={15}
                color={message.read_at ? colors.info : colors.inkFaint}
              />
            )
          ) : null}
        </View>
      </View>

      <Modal visible={lightbox} transparent animationType="fade">
        <Pressable style={styles.lightbox} onPress={() => setLightbox(false)}>
          {message.attachment ? (
            <Image
              source={{ uri: message.attachment.url }}
              style={styles.lightboxImage}
              contentFit="contain"
            />
          ) : null}
          <View style={styles.lightboxClose}>
            <Ionicons name="close" size={26} color={colors.white} />
          </View>
        </Pressable>
      </Modal>
    </Animated.View>
  );
}

export const ChatBubble = React.memo(ChatBubbleImpl, (prev, next) => {
  // Message content is immutable once created -- only the id (for optimistic
  // -> real swap) and read_at (delivery receipt) can change after the first
  // render. useMessages() polls every 6s and returns brand-new objects even
  // when nothing changed; without this comparator every bubble on screen
  // would re-render (and AudioBubble would re-run its native player hooks)
  // on every single poll tick.
  return (
    prev.message.id === next.message.id &&
    prev.message.read_at === next.message.read_at
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: spacing.sm, paddingHorizontal: spacing.md },
  rowOwn: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '82%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 6,
    ...shadow.sm,
  },
  // The squared-off corner on the outer edge is the bubble's "tail".
  bubbleOwn: { backgroundColor: colors.bubbleOwn, borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: colors.bubbleOther,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.line,
  },
  bubblePending: { opacity: 0.72 },
  senderName: { ...typography.micro, color: colors.green, marginBottom: 3 },
  body: { ...typography.body, lineHeight: 21 },
  bodyOwn: { color: colors.ink },
  bodyOther: { color: colors.ink },
  image: {
    width: 216,
    height: 216,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
    backgroundColor: colors.surfaceAlt,
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    minWidth: 190,
  },
  audioButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioTrackWrap: { flex: 1, gap: 6 },
  audioTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    overflow: 'hidden',
  },
  audioProgress: { height: 3, backgroundColor: colors.green },
  audioDuration: { ...typography.caption, fontSize: 11, color: colors.inkMuted },
  uploadingText: { ...typography.caption, color: colors.inkMuted },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 2,
  },
  time: { ...typography.caption, fontSize: 11, color: colors.inkFaint },
  systemWrap: { alignItems: 'center', marginVertical: spacing.md, paddingHorizontal: spacing.xl },
  systemText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.inkMuted,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    textAlign: 'center',
    overflow: 'hidden',
  },
  lightbox: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: { width: '100%', height: '80%' },
  lightboxClose: { position: 'absolute', top: 52, right: 24 },
});
