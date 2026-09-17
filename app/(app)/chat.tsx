/**
 * Messages.
 *
 * A single thread between this agent and the command centre. There is no
 * contact list and no group chat: an agent has exactly one counterpart, and
 * agents cannot message each other -- comparing figures between stations
 * before submitting is precisely the coordination this platform exists to make
 * unnecessary.
 *
 * Press-and-hold to record a voice note, like WhatsApp. That gesture matters
 * here beyond familiarity: it is usable one-handed, in the dark, by someone who
 * is describing a fast-moving situation and has no time to type.
 */

import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { ChatMessage } from '../../src/api/types';
import { ChatBubble } from '../../src/components/ChatBubble';
import { Banner, EmptyState, LoadingState } from '../../src/components/ui';
import { captureFormPhoto, pickFormPhoto } from '../../src/hooks/usePhoto';
import { useMarkRead, useMessages, useSendMessage } from '../../src/hooks/useChat';
import {
  HIT_SLOP,
  MIN_TOUCH,
  colors,
  radius,
  spacing,
  typography,
} from '../../src/theme';

/** Ignore accidental taps that produce a fraction of a second of audio. */
const MIN_RECORDING_MS = 800;

function newUuid(): string {
  // RFC4122 v4 via the runtime's crypto, with a non-crypto fallback for older
  // JS engines. This is an idempotency key, not a secret.
  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { data: messages, isLoading, error } = useMessages();
  const sendMessage = useSendMessage();
  const markRead = useMarkRead();

  const [draft, setDraft] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const recordStartedAt = useRef<number>(0);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const pulse = useSharedValue(0);

  // Mark the command centre's messages read on open, so the tab dot clears.
  useEffect(() => {
    if (messages?.length) markRead();
  }, [messages?.length, markRead]);

  useEffect(() => {
    (async () => {
      const granted = await AudioModule.requestRecordingPermissionsAsync();
      if (granted.granted) {
        // allowsRecording must be on for iOS to route input to the mic.
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(
          () => undefined,
        );
      }
    })();
  }, []);

  useEffect(() => {
    pulse.value = recorderState.isRecording
      ? withRepeat(withTiming(1, { duration: 700 }), -1, true)
      : withTiming(0, { duration: 200 });
  }, [recorderState.isRecording, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + pulse.value * 0.6,
    transform: [{ scale: 1 + pulse.value * 0.15 }],
  }));

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  useEffect(() => {
    if (messages?.length) scrollToEnd();
  }, [messages?.length, scrollToEnd]);

  function sendText() {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    setUploadError(null);
    sendMessage.mutate(
      { kind: 'TEXT', body, client_uuid: newUuid() },
      {
        onError: () => {
          // Put the text back so the agent does not lose what they typed.
          setDraft(body);
          setUploadError('Message not sent. Check your signal and try again.');
        },
      },
    );
  }

  async function attachImage(source: 'camera' | 'library') {
    setUploadError(null);
    setAttaching(true);
    try {
      const photo =
        source === 'camera' ? await captureFormPhoto() : await pickFormPhoto();
      if (!photo) return;

      const attachment = await api.uploadFile({
        uri: photo.uri,
        name: 'photo.jpg',
        mimeType: 'image/jpeg',
        purpose: 'CHAT',
      });

      sendMessage.mutate({
        kind: 'IMAGE',
        attachment_id: attachment.id,
        body: '',
        client_uuid: newUuid(),
      });
    } catch (err) {
      setUploadError(
        err instanceof ApiError
          ? err.message
          : 'Could not send the photo. Check your signal and try again.',
      );
    } finally {
      setAttaching(false);
    }
  }

  function showAttachOptions() {
    Alert.alert('Send a photo', undefined, [
      { text: 'Take a photo', onPress: () => attachImage('camera') },
      { text: 'Choose from gallery', onPress: () => attachImage('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function startRecording() {
    const permission = await AudioModule.getRecordingPermissionsAsync();
    if (!permission.granted) {
      const requested = await AudioModule.requestRecordingPermissionsAsync();
      if (!requested.granted) {
        setUploadError('Microphone access is needed to send a voice note.');
        return;
      }
    }

    try {
      setUploadError(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordStartedAt.current = Date.now();
    } catch {
      setUploadError('Could not start recording.');
    }
  }

  async function stopRecordingAndSend() {
    if (!recorderState.isRecording) return;

    const elapsed = Date.now() - recordStartedAt.current;

    try {
      await recorder.stop();
      const uri = recorder.uri;

      if (!uri || elapsed < MIN_RECORDING_MS) {
        // Too short to be intentional -- discard silently rather than sending
        // an empty bubble.
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

      const attachment = await api.uploadFile({
        uri,
        name: 'voice-note.m4a',
        mimeType: 'audio/m4a',
        purpose: 'CHAT',
        durationMs: elapsed,
      });

      sendMessage.mutate({
        kind: 'AUDIO',
        attachment_id: attachment.id,
        client_uuid: newUuid(),
      });
    } catch (err) {
      setUploadError(
        err instanceof ApiError
          ? err.message
          : 'Could not send the voice note. Check your signal.',
      );
    }
  }

  if (isLoading && !messages) {
    return <LoadingState message="Loading messages" />;
  }

  const recording = recorderState.isRecording;
  const canSendText = draft.trim().length > 0;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerIcon}>
          <Ionicons name="headset" size={18} color={colors.white} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.headerTitle}>Command Centre</Text>
          <Text style={styles.headerSubtitle}>
            Whoever is on duty will answer
          </Text>
        </View>
      </View>

      {error ? (
        <View style={styles.errorWrap}>
          <Banner
            tone="error"
            message="Could not load messages. They will appear when you have signal."
          />
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {messages?.length ? (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <ChatBubble message={item} />}
            contentContainerStyle={styles.list}
            onContentSizeChange={scrollToEnd}
            showsVerticalScrollIndicator={false}
            // Keeps scrolling smooth on cheap devices with a long thread.
            initialNumToRender={20}
            maxToRenderPerBatch={12}
            windowSize={11}
          />
        ) : (
          <EmptyState
            title="No messages yet"
            message="Use this to tell the command centre what is happening at your station -- delays, missing materials, anything that needs a decision."
            icon={
              <Ionicons name="chatbubbles-outline" size={42} color={colors.inkFaint} />
            }
          />
        )}

        {uploadError ? (
          <Animated.View entering={FadeIn.duration(180)} style={styles.errorWrap}>
            <Banner tone="error" message={uploadError} />
          </Animated.View>
        ) : null}

        {recording ? (
          <Animated.View entering={FadeIn.duration(150)} style={styles.recordingBar}>
            <Animated.View style={[styles.recordingDot, pulseStyle]} />
            <Text style={styles.recordingText}>
              Recording... release to send
            </Text>
            <Text style={styles.recordingTimer}>
              {Math.floor((recorderState.durationMillis ?? 0) / 1000)}s
            </Text>
          </Animated.View>
        ) : null}

        <View
          style={[
            styles.composer,
            { paddingBottom: Math.max(insets.bottom, spacing.sm) },
          ]}
        >
          <Pressable
            onPress={showAttachOptions}
            disabled={attaching || recording}
            hitSlop={HIT_SLOP}
            style={styles.attachButton}
            accessibilityRole="button"
            accessibilityLabel="Send a photo"
          >
            <Ionicons
              name="camera-outline"
              size={23}
              color={attaching ? colors.inkFaint : colors.green}
            />
          </Pressable>

          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={recording ? 'Recording...' : 'Message the command centre'}
            placeholderTextColor={colors.inkFaint}
            style={styles.input}
            multiline
            editable={!recording}
            accessibilityLabel="Message text"
          />

          {canSendText ? (
            <Pressable
              onPress={sendText}
              style={styles.sendButton}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <Ionicons name="send" size={19} color={colors.white} />
            </Pressable>
          ) : (
            <Pressable
              onPressIn={startRecording}
              onPressOut={stopRecordingAndSend}
              style={[styles.sendButton, recording && styles.sendButtonRecording]}
              accessibilityRole="button"
              accessibilityLabel="Hold to record a voice note"
            >
              <Ionicons name="mic" size={21} color={colors.white} />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.green,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...typography.heading, color: colors.white },
  headerSubtitle: {
    ...typography.caption,
    fontSize: 12,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 1,
  },
  errorWrap: { padding: spacing.md },
  list: { paddingVertical: spacing.base, flexGrow: 1, justifyContent: 'flex-end' },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.rejectedSurface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.rejected,
  },
  recordingText: { ...typography.label, color: colors.rejected, flex: 1 },
  recordingTimer: {
    ...typography.label,
    color: colors.rejected,
    fontVariant: ['tabular-nums'],
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  attachButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    maxHeight: 120,
    minHeight: MIN_TOUCH,
  },
  sendButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.pill,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonRecording: { backgroundColor: colors.rejected },
});
