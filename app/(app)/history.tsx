/**
 * Submission History.
 *
 * Every Form 34A photo this agent has sent, most recent first. Exists mainly
 * as reassurance -- an agent who submitted at 22:00 and cannot get a bar of
 * signal for confirmation needs somewhere to check "did that actually go
 * through", without asking the command centre over a channel meant for
 * incidents.
 *
 * Reachable from the Submit screen, not a tab: this is a review screen an
 * agent opens occasionally, not one of the four daily tab-bar destinations.
 *
 * Each submission carries its own Q&A thread -- a command-centre question
 * about that specific photo/form, answerable right here, rather than an
 * agent having to guess which line in the general chat a question referred
 * to once several stations' worth of results are in.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Card,
  DetailRow,
  EmptyState,
  LoadingState,
  StatusPill,
  formatNumber,
} from '../../src/components/ui';
import {
  useReplyToSubmission,
  useSubmissionHistory,
} from '../../src/hooks/useSubmissionHistory';
import type { ChatMessage, SubmissionHistoryItem } from '../../src/api/types';
import {
  HIT_SLOP,
  colors,
  radius,
  spacing,
  typography,
} from '../../src/theme';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function QuestionThread({
  submissionId,
  questions,
}: {
  submissionId: string;
  questions: ChatMessage[];
}) {
  const [draft, setDraft] = useState('');
  const reply = useReplyToSubmission();

  const handleSend = () => {
    const body = draft.trim();
    if (!body || reply.isPending) return;
    setDraft('');
    reply.mutate(
      { submissionId, body },
      // Put the draft back so a failed send is not silently lost.
      { onError: () => setDraft(body) },
    );
  };

  return (
    <View style={styles.threadWrap}>
      <View style={styles.threadHeader}>
        <Ionicons name="chatbubble-ellipses" size={13} color={colors.info} />
        <Text style={styles.threadHeaderText}>Command Centre asked about this</Text>
      </View>

      {questions.map((q) => (
        <View
          key={q.id}
          style={[styles.threadRow, q.from_agent && styles.threadRowOwn]}
        >
          <View
            style={[
              styles.threadBubble,
              q.from_agent ? styles.threadBubbleOwn : styles.threadBubbleOther,
            ]}
          >
            <Text
              style={[
                styles.threadBubbleText,
                q.from_agent && styles.threadBubbleTextOwn,
              ]}
            >
              {q.body}
            </Text>
          </View>
        </View>
      ))}

      <View style={styles.threadComposer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Reply to command centre..."
          placeholderTextColor={colors.inkFaint}
          style={styles.threadInput}
          multiline
        />
        <Pressable
          onPress={handleSend}
          disabled={!draft.trim() || reply.isPending}
          style={[
            styles.threadSend,
            (!draft.trim() || reply.isPending) && styles.threadSendDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Send reply"
        >
          {reply.isPending ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="send" size={14} color={colors.white} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const HistoryCard = React.memo(function HistoryCard({
  item,
  index,
  onOpenPhoto,
}: {
  item: SubmissionHistoryItem;
  index: number;
  onOpenPhoto: (url: string) => void;
}) {
  return (
    <Card index={index} style={styles.card}>
      <View style={styles.cardTop}>
        <Pressable
          onPress={() => item.photo_url && onOpenPhoto(item.photo_url)}
          style={styles.thumbWrap}
          accessibilityRole="imagebutton"
          accessibilityLabel="View full submitted photo"
        >
          {item.photo_url ? (
            <Image
              source={{ uri: item.photo_url }}
              style={styles.thumb}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View style={[styles.thumb, styles.thumbFallback]}>
              <Ionicons name="document-text-outline" size={22} color={colors.inkFaint} />
            </View>
          )}
          {item.photo_url ? (
            <View style={styles.zoomBadge}>
              <Ionicons name="expand-outline" size={12} color={colors.white} />
            </View>
          ) : null}
        </Pressable>

        <View style={styles.cardHeaderText}>
          <Text style={styles.stationName} numberOfLines={1}>
            {item.polling_station_name}
          </Text>
          <Text style={styles.raceTitle} numberOfLines={1}>
            {item.race_title}
          </Text>
          <Text style={styles.iebcCode}>{item.iebc_code}</Text>
        </View>

        <StatusPill status={item.status} />
      </View>

      {item.rejection_reason ? (
        <View style={styles.reasonWrap}>
          <Ionicons name="alert-circle" size={14} color={colors.rejected} />
          <Text style={styles.reasonText} numberOfLines={2}>
            {item.rejection_reason}
          </Text>
        </View>
      ) : null}

      <View style={styles.divider} />

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatNumber(item.total_votes_cast)}</Text>
          <Text style={styles.statLabel}>Total cast</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{item.turnout}%</Text>
          <Text style={styles.statLabel}>Turnout</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue} numberOfLines={1}>
            {formatDate(item.submitted_at)}
          </Text>
          <Text style={styles.statLabel}>Sent</Text>
        </View>
      </View>

      {item.questions.length > 0 ? (
        <QuestionThread submissionId={item.id} questions={item.questions} />
      ) : null}
    </Card>
  );
});

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isLoading, error, refetch, isRefetching } = useSubmissionHistory();
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.green, colors.greenLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + spacing.md }]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={HIT_SLOP}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.white} />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Submission History</Text>
          <Text style={styles.headerSubtitle}>
            {data ? `${data.length} sent` : 'Your sent Form 34A photos'}
          </Text>
        </View>
      </LinearGradient>

      {isLoading && !data ? (
        <LoadingState message="Loading your history" />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.green}
              colors={[colors.green]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {error && !data ? (
            <EmptyState
              icon={<Ionicons name="cloud-offline-outline" size={40} color={colors.inkFaint} />}
              title="Could not load history"
              message="Pull down to try again."
            />
          ) : !data?.length ? (
            <EmptyState
              icon={<Ionicons name="images-outline" size={40} color={colors.inkFaint} />}
              title="Nothing sent yet"
              message="Every Form 34A photo you submit will appear here."
            />
          ) : (
            data.map((item, index) => (
              <HistoryCard
                key={item.id}
                item={item}
                index={index}
                onOpenPhoto={setViewerUrl}
              />
            ))
          )}
        </ScrollView>
      )}

      <Modal
        visible={viewerUrl !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerUrl(null)}
      >
        <Animated.View entering={FadeIn.duration(150)} style={styles.viewerRoot}>
          <Pressable
            style={[styles.viewerClose, { top: insets.top + spacing.md }]}
            onPress={() => setViewerUrl(null)}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
          >
            <Ionicons name="close" size={26} color={colors.white} />
          </Pressable>
          {viewerUrl ? (
            <Image
              source={{ uri: viewerUrl }}
              style={styles.viewerImage}
              contentFit="contain"
            />
          ) : null}
        </Animated.View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: { flex: 1 },
  headerTitle: { ...typography.title, color: colors.white },
  headerSubtitle: { ...typography.caption, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  scroll: { padding: spacing.base, gap: spacing.md },
  card: { gap: 0 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  thumbWrap: { position: 'relative' },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  zoomBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  cardHeaderText: { flex: 1, gap: 1 },
  stationName: { ...typography.bodyStrong, color: colors.ink },
  raceTitle: { ...typography.caption, color: colors.inkMuted },
  iebcCode: {
    ...typography.micro,
    color: colors.inkFaint,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  reasonWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.sm,
    backgroundColor: colors.rejectedSurface,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  reasonText: { ...typography.caption, color: colors.rejected, flex: 1, lineHeight: 17 },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: spacing.md,
  },
  statsRow: { flexDirection: 'row' },
  stat: { flex: 1 },
  statValue: { ...typography.bodyStrong, color: colors.ink, fontSize: 14 },
  statLabel: { ...typography.micro, color: colors.inkFaint, marginTop: 2 },
  threadWrap: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: spacing.sm,
  },
  threadHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  threadHeaderText: { ...typography.micro, color: colors.info },
  threadRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  threadRowOwn: { justifyContent: 'flex-end' },
  threadBubble: {
    maxWidth: '85%',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  threadBubbleOther: { backgroundColor: colors.infoSurface },
  threadBubbleOwn: { backgroundColor: colors.bubbleOwn },
  threadBubbleText: { ...typography.caption, color: colors.ink, lineHeight: 18 },
  threadBubbleTextOwn: { color: colors.ink },
  threadComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  threadInput: {
    flex: 1,
    minHeight: 38,
    maxHeight: 90,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.caption,
    color: colors.ink,
  },
  threadSend: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  threadSendDisabled: { backgroundColor: colors.lineStrong },
  viewerRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerClose: {
    position: 'absolute',
    right: spacing.lg,
    zIndex: 1,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: { width: '100%', height: '80%' },
});
