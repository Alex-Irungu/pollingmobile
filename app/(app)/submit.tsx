/**
 * Submit Result.
 *
 * The screen the whole app exists for. It runs once, at night, by a tired
 * person who may have poor signal, and it must not lose anything.
 *
 * Order of the flow is deliberate: photo first, then figures. The photograph
 * IS the evidence; the typed numbers are a convenience that lets the command
 * centre tally quickly. If something goes wrong after the photo is attached,
 * the evidence still exists.
 */

import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Image, type ImageStyle } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  LinearTransition,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as api from '../../src/api/endpoints';
import { Button } from '../../src/components/Button';
import { VoteInput } from '../../src/components/VoteInput';
import {
  Banner,
  Card,
  DetailRow,
  LoadingState,
  SectionLabel,
  formatNumber,
} from '../../src/components/ui';
import { usePosting } from '../../src/hooks/usePosting';
import {
  captureFormPhoto,
  formatBytes,
  pickFormPhoto,
  type PreparedPhoto,
} from '../../src/hooks/usePhoto';
import { useResultValidation } from '../../src/hooks/useResultValidation';
import { useSubmissionQueue } from '../../src/hooks/useSubmissionQueue';
import { submissionHistoryQueryKey } from '../../src/hooks/useSubmissionHistory';
import {
  discardQueued,
  flushQueue,
  queueSubmission,
} from '../../src/services/submissionQueue';
import {
  colors,
  radius,
  shadow,
  spacing,
  typography,
} from '../../src/theme';

type Phase = 'form' | 'review' | 'sending' | 'done';

/**
 * Declared outside StyleSheet.create, which widens each entry to a
 * ViewStyle|TextStyle|ImageStyle union that expo-image's ImageStyle prop
 * rejects.
 */
const previewImageStyle: ImageStyle = {
  width: '100%',
  height: 200,
  borderRadius: radius.md,
  backgroundColor: colors.surfaceAlt,
};

export default function SubmitScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: posting, isLoading, refetch } = usePosting();

  // Warm the History screen's cache as soon as this screen (its new primary
  // entry point) mounts, so the History button feels instant rather than
  // showing a spinner on first tap.
  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: submissionHistoryQueryKey,
      queryFn: async () => {
        const response = await api.fetchSubmissionHistory();
        return response.results;
      },
      staleTime: 60_000,
    });
  }, [queryClient]);

  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [rejectedVotes, setRejectedVotes] = useState('');
  const [notes, setNotes] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [tryingNow, setTryingNow] = useState(false);
  const queue = useSubmissionQueue();

  const candidates = posting?.candidates ?? [];
  const station = posting?.polling_station ?? null;
  const race = posting?.race ?? null;
  const registeredVoters = station?.registered_voters ?? null;

  const validation = useResultValidation({
    candidates,
    votes,
    rejectedVotes,
    registeredVoters,
    hasPhoto: photo !== null,
  });

  const totalCast = useMemo(() => {
    const rejected = Number.parseInt(rejectedVotes, 10);
    return validation.candidateTotal + (Number.isFinite(rejected) ? rejected : 0);
  }, [validation.candidateTotal, rejectedVotes]);

  async function attachPhoto(source: 'camera' | 'library') {
    try {
      const result =
        source === 'camera' ? await captureFormPhoto() : await pickFormPhoto();
      if (result) {
        setPhoto(result);
        setSubmitError(null);
      }
    } catch {
      setSubmitError('Could not prepare the photo. Try taking it again.');
    }
  }

  function goToReview() {
    if (!validation.canSubmit || !station || !race) return;

    // Ping /health/ now so Render starts waking up while the agent reviews.
    // By the time they confirm, the cold-start is behind us.
    api.warmUp();
    setSubmitError(null);
    setPhase('review');
  }

  async function submit() {
    if (!station || !race || !photo) return;

    setPhase('sending');
    setSubmitError(null);

    // Everything is written to this phone first. From this line on, the
    // result cannot be lost: if the network fails at any point below, the
    // queue keeps retrying on its own until it lands.
    setProgress('Saving safely on this phone…');
    await queueSubmission({
      photoUri: photo.uri,
      photoName: `form-${station.iebc_code}.jpg`,
      payload: {
        race: race.id,
        polling_station: station.id,
        total_registered_voters: registeredVoters ?? 0,
        total_valid_votes: validation.candidateTotal,
        total_rejected_votes: Number.parseInt(rejectedVotes, 10) || 0,
        total_votes_cast: totalCast,
        notes: notes.trim(),
        candidate_votes: candidates.map((candidate) => ({
          candidate: candidate.id,
          votes: Number.parseInt(votes[candidate.id] ?? '0', 10) || 0,
        })),
      },
    });

    const outcome = await flushQueue(setProgress);

    if (outcome === 'sent') {
      setPhase('done');
      refetch();
      queryClient.invalidateQueries({ queryKey: submissionHistoryQueryKey });
      return;
    }

    // 'waiting': saved and will auto-send. The queue guard below renders the
    // saved screen. 'rejected': the rejected guard below renders the reason.
    setPhase('form');
    setProgress('');
  }

  /** After a server rejection: restore the figures into the form so the agent
   * corrects them rather than retyping everything at midnight. */
  async function correctRejected() {
    if (queue.kind !== 'rejected') return;
    const { payload } = queue.record;

    const restored: Record<string, string> = {};
    for (const cv of payload.candidate_votes) restored[cv.candidate] = String(cv.votes);
    setVotes(restored);
    setRejectedVotes(String(payload.total_rejected_votes));
    setNotes(payload.notes ?? '');
    setPhoto(null);
    setSubmitError(queue.record.lastError);

    await discardQueued();
    setPhase('form');
  }

  if (isLoading && !posting) {
    return <LoadingState message="Loading your station" />;
  }

  // --- Guard rails ------------------------------------------------------- //

  if (!station || !race) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.guard}>
          <Banner
            tone="warning"
            title="Not ready to submit"
            message={
              !station
                ? 'You have not been posted to a polling stream yet. The command centre must assign you before you can send a result.'
                : 'No active race is configured for your stream. Contact the command centre.'
            }
          />
        </View>
      </View>
    );
  }

  if (posting?.existing_submission && phase !== 'done') {
    const existing = posting.existing_submission;
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.guard}>
          <Banner
            tone={existing.status === 'REJECTED' ? 'warning' : 'success'}
            title="Result already sent"
            message={
              existing.status === 'REJECTED'
                ? `The command centre asked for a correction: ${existing.rejection_reason || 'no reason given'}. Contact them in Messages -- they will reopen it for you.`
                : 'Your result for this stream has reached the command centre. Check My Station for its progress.'
            }
            action={{
              label: 'Go to My Station',
              onPress: () => router.replace('/(app)'),
            }}
          />
          <Pressable
            onPress={() => router.push('/(app)/history')}
            style={styles.historyLink}
            accessibilityRole="button"
            accessibilityLabel="View submission history"
          >
            <Ionicons name="time-outline" size={18} color={colors.green} />
            <Text style={styles.historyLinkText}>View your submission history</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.green} />
          </Pressable>
        </View>
      </View>
    );
  }

  // --- Queued: saved on the phone, sending itself ------------------------- //

  if (queue.kind === 'pending' && phase !== 'done' && phase !== 'sending') {
    return (
      <View style={[styles.root, styles.centre, { paddingTop: insets.top }]}>
        <Animated.View entering={FadeInDown.duration(400)} style={styles.successWrap}>
          <View style={[styles.successIcon, styles.queuedIcon]}>
            <Ionicons name="cloud-upload-outline" size={40} color={colors.white} />
          </View>
          <Text style={styles.successTitle}>Result saved</Text>
          <Text style={styles.successBody}>
            Your figures and the form photo are safe on this phone. The app is
            sending them by itself and will keep trying until they reach the
            command centre — you do not need to stay on this screen.
          </Text>
          <Card style={styles.successCard}>
            <DetailRow label="Stream" value={station.display_name} />
            <DetailRow
              label="Saved at"
              value={new Date(queue.record.queuedAt).toLocaleTimeString('en-KE')}
            />
            <DetailRow
              label="Status"
              value={queue.sending ? 'Sending now…' : 'Waiting for signal'}
            />
          </Card>
          <Button
            label={tryingNow || queue.sending ? 'Trying…' : 'Try to send now'}
            onPress={async () => {
              setTryingNow(true);
              const outcome = await flushQueue();
              setTryingNow(false);
              if (outcome === 'sent') {
                setPhase('done');
                refetch();
                queryClient.invalidateQueries({ queryKey: submissionHistoryQueryKey });
              }
            }}
            disabled={tryingNow || queue.sending}
            style={styles.successButton}
          />
          <Button
            label="Back to My Station"
            variant="ghost"
            onPress={() => router.replace('/(app)')}
          />
        </Animated.View>
      </View>
    );
  }

  if (queue.kind === 'rejected' && phase !== 'done') {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.guard}>
          <Banner
            tone="error"
            title="The server could not accept this result"
            message={
              queue.record.lastError ??
              'Check the figures against your form and send it again.'
            }
          />
          <Button label="Correct the figures and resend" onPress={correctRejected} />
        </View>
      </View>
    );
  }

  // --- Success ------------------------------------------------------------ //

  if (phase === 'done') {
    return (
      <View style={[styles.root, styles.centre, { paddingTop: insets.top }]}>
        <Animated.View entering={FadeInDown.duration(400)} style={styles.successWrap}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={44} color={colors.white} />
          </View>
          <Text style={styles.successTitle}>Result sent</Text>
          <Text style={styles.successBody}>
            The command centre has your figures and the form photo. They will
            review it and you will see the outcome on My Station.
          </Text>
          <Card style={styles.successCard}>
            <DetailRow label="Stream" value={station.display_name} />
            <DetailRow label="Valid votes" value={formatNumber(validation.candidateTotal)} mono />
            <DetailRow label="Total cast" value={formatNumber(totalCast)} mono />
          </Card>
          <Button
            label="Back to My Station"
            onPress={() => router.replace('/(app)')}
            style={styles.successButton}
          />
          <Button
            label="View submission history"
            variant="ghost"
            onPress={() => router.push('/(app)/history')}
          />
        </Animated.View>
      </View>
    );
  }

  // --- Review: the last look before it goes ------------------------------- //

  if (phase === 'review' && photo) {
    return (
      <View style={styles.root}>
        <LinearGradient
          colors={[colors.green, colors.greenLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + spacing.md }]}
        >
          <Text style={styles.headerTitle}>Check before sending</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {station.display_name}
          </Text>
        </LinearGradient>

        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + spacing.xxxl },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.block}>
            <SectionLabel>Compare against your form</SectionLabel>
            <Card>
              <Image
                source={{ uri: photo.uri }}
                style={previewImageStyle}
                contentFit="contain"
                transition={150}
              />
              <Text style={styles.reviewHint}>
                Read each figure off the photo above and check it against the
                row below. This is the last chance to catch a mis-key — after
                sending, corrections go through the command centre.
              </Text>
            </Card>
          </View>

          <View style={styles.block}>
            <SectionLabel>The figures you will send</SectionLabel>
            <Card>
              {candidates.map((candidate, index) => (
                <View
                  key={candidate.id}
                  style={[
                    styles.reviewRow,
                    index < candidates.length - 1 && styles.reviewDivider,
                  ]}
                >
                  <View style={styles.flex}>
                    <Text style={styles.reviewName}>{candidate.full_name}</Text>
                    <Text style={styles.reviewParty}>
                      {candidate.party_abbreviation || 'INDEPENDENT'}
                    </Text>
                  </View>
                  <Text style={styles.reviewVotes}>
                    {formatNumber(Number.parseInt(votes[candidate.id] ?? '0', 10) || 0)}
                  </Text>
                </View>
              ))}
              <View style={styles.reviewTotals}>
                <DetailRow
                  label="Total valid votes"
                  value={formatNumber(validation.candidateTotal)}
                  mono
                />
                <DetailRow
                  label="Rejected ballots"
                  value={formatNumber(Number.parseInt(rejectedVotes, 10) || 0)}
                  mono
                />
                <DetailRow label="Total votes cast" value={formatNumber(totalCast)} mono />
                {validation.turnoutPercent !== null ? (
                  <DetailRow
                    label="Turnout"
                    value={`${validation.turnoutPercent.toFixed(1)}%`}
                    mono
                  />
                ) : null}
              </View>
            </Card>
          </View>

          {validation.warnings.length ? (
            <View style={styles.block}>
              {validation.warnings.map((issue, index) => (
                <Banner
                  key={`w${index}`}
                  tone="warning"
                  title="Worth a second look"
                  message={issue.message}
                />
              ))}
            </View>
          ) : null}

          <Button label="These figures match my form — send" onPress={submit} />
          <Button
            label="Go back and edit"
            variant="ghost"
            onPress={() => setPhase('form')}
          />
        </ScrollView>
      </View>
    );
  }

  // --- Form --------------------------------------------------------------- //

  const sending = phase === 'sending';

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.green, colors.greenLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + spacing.md }]}
      >
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <Text style={styles.headerTitle}>Submit Result</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {station.display_name}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/(app)/history')}
            style={styles.historyButton}
            accessibilityRole="button"
            accessibilityLabel="View submission history"
          >
            <Ionicons name="time-outline" size={20} color={colors.white} />
            <Text style={styles.historyButtonText}>History</Text>
          </Pressable>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + spacing.xxxl },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Step 1 -- the evidence. */}
          <View style={styles.block}>
            <SectionLabel>Step 1 — Photograph the form</SectionLabel>
            <Card>
              {photo ? (
                <Animated.View entering={FadeIn.duration(240)}>
                  <Image
                    source={{ uri: photo.uri }}
                    style={previewImageStyle}
                    contentFit="cover"
                    transition={200}
                  />
                  <View style={styles.photoMeta}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.verified} />
                    <Text style={styles.photoMetaText}>
                      Ready to send{photo.sizeBytes ? ` · ${formatBytes(photo.sizeBytes)}` : ''}
                    </Text>
                  </View>
                  <View style={styles.photoActions}>
                    <Button
                      label="Retake"
                      variant="secondary"
                      onPress={() => attachPhoto('camera')}
                      disabled={sending}
                      fullWidth={false}
                      style={styles.flex}
                    />
                    <Button
                      label="Remove"
                      variant="ghost"
                      onPress={() => setPhoto(null)}
                      disabled={sending}
                      fullWidth={false}
                      style={styles.flex}
                    />
                  </View>
                </Animated.View>
              ) : (
                <>
                  <Text style={styles.helpText}>
                    Lay the form flat, fill the frame, and make sure the figures and
                    the signatures are readable.
                  </Text>
                  <Pressable
                    onPress={() => attachPhoto('camera')}
                    disabled={sending}
                    style={({ pressed }) => [
                      styles.captureZone,
                      pressed && styles.captureZonePressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Take a photo of the form"
                  >
                    <View style={styles.captureIcon}>
                      <Ionicons name="camera" size={26} color={colors.green} />
                    </View>
                    <Text style={styles.captureTitle}>Take photo</Text>
                    <Text style={styles.captureHint}>
                      Compressed automatically so it sends on a weak signal
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => attachPhoto('library')}
                    disabled={sending}
                    style={styles.linkRow}
                    accessibilityRole="button"
                  >
                    <Ionicons name="images-outline" size={16} color={colors.green} />
                    <Text style={styles.linkText}>Choose a photo I already took</Text>
                  </Pressable>
                </>
              )}
            </Card>
          </View>

          {/* Step 2 -- the figures, in ballot order. */}
          <View style={styles.block}>
            <SectionLabel>Step 2 — Votes per candidate</SectionLabel>
            <Card>
              <Text style={styles.helpText}>
                In the same order as the form. Enter 0 where a candidate got no
                votes.
              </Text>
              {candidates.map((candidate, index) => (
                <VoteInput
                  key={candidate.id}
                  badge={candidate.ballot_number ?? index + 1}
                  label={candidate.full_name}
                  sublabel={candidate.party_abbreviation || 'INDEPENDENT'}
                  value={votes[candidate.id] ?? ''}
                  onChange={(value) =>
                    setVotes((current) => ({ ...current, [candidate.id]: value }))
                  }
                  editable={!sending}
                />
              ))}

              <View style={styles.runningTotal}>
                <Text style={styles.runningTotalLabel}>Candidate votes add up to</Text>
                <Text style={styles.runningTotalValue}>
                  {formatNumber(validation.candidateTotal)}
                </Text>
              </View>
            </Card>
          </View>

          {/* Step 3 -- declared totals. */}
          <View style={styles.block}>
            <SectionLabel>Step 3 — Totals from the form</SectionLabel>
            <Card>
              <View style={styles.derivedRow}>
                <View style={styles.flex}>
                  <Text style={styles.derivedLabel}>Total valid votes</Text>
                  <Text style={styles.derivedHint}>sum of the candidates above</Text>
                </View>
                <Text style={styles.derivedValue}>
                  {formatNumber(validation.candidateTotal)}
                </Text>
              </View>

              <VoteInput
                label="Rejected ballots"
                sublabel="Spoilt or rejected"
                value={rejectedVotes}
                onChange={setRejectedVotes}
                emphasis
                editable={!sending}
              />

              <View style={styles.derivedRow}>
                <View style={styles.flex}>
                  <Text style={styles.derivedLabel}>Total votes cast</Text>
                  <Text style={styles.derivedHint}>valid + rejected</Text>
                </View>
                <Text style={styles.derivedValue}>{formatNumber(totalCast)}</Text>
              </View>

              {validation.turnoutPercent !== null ? (
                <View style={styles.derivedRow}>
                  <View style={styles.flex}>
                    <Text style={styles.derivedLabel}>Turnout</Text>
                    <Text style={styles.derivedHint}>
                      of {formatNumber(registeredVoters)} registered
                    </Text>
                  </View>
                  <Text style={styles.derivedValue}>
                    {validation.turnoutPercent.toFixed(1)}%
                  </Text>
                </View>
              ) : null}
            </Card>
          </View>

          {/* Live feedback, while the form is still in hand. */}
          {validation.issues.length ? (
            <Animated.View layout={LinearTransition} style={styles.block}>
              {validation.errors.map((issue, index) => (
                <Banner key={`e${index}`} tone="error" message={issue.message} />
              ))}
              {validation.warnings.map((issue, index) => (
                <Banner
                  key={`w${index}`}
                  tone="warning"
                  title="Worth a second look"
                  message={issue.message}
                />
              ))}
            </Animated.View>
          ) : null}

          <View style={styles.block}>
            <SectionLabel>Anything unusual? (optional)</SectionLabel>
            <Card>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. counting was interrupted, form was amended by the presiding officer"
                placeholderTextColor={colors.inkFaint}
                multiline
                style={styles.notes}
                editable={!sending}
                accessibilityLabel="Notes"
              />
            </Card>
          </View>

          {submitError ? (
            <View style={styles.block}>
              <Banner tone="error" title="Not sent" message={submitError} />
            </View>
          ) : null}

          {sending ? (
            <View style={styles.sendingRow}>
              <ActivityIndicator color={colors.green} />
              <Text style={styles.sendingText}>{progress}</Text>
            </View>
          ) : (
            <Button
              label={
                validation.canSubmit ? 'Review and send' : 'Fix the items above to send'
              }
              onPress={goToReview}
              disabled={!validation.canSubmit}
            />
          )}

          <Text style={styles.footer}>
            Once sent you cannot edit this. If a figure is wrong, message the
            command centre and they will reopen it.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  centre: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerTitle: { ...typography.title, color: colors.white },
  headerSubtitle: { ...typography.caption, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  historyButtonText: { ...typography.label, fontSize: 12, color: colors.white },
  scroll: { padding: spacing.base, gap: spacing.lg },
  block: { gap: spacing.sm },
  guard: { padding: spacing.base, gap: spacing.md },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    ...shadow.sm,
  },
  historyLinkText: { ...typography.bodyStrong, color: colors.ink, flex: 1 },
  helpText: {
    ...typography.caption,
    color: colors.inkMuted,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  captureZone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  captureZonePressed: { backgroundColor: colors.greenSurface, borderColor: colors.green },
  captureIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.greenSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  captureTitle: { ...typography.heading, color: colors.ink },
  captureHint: {
    ...typography.caption,
    fontSize: 12,
    color: colors.inkMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  linkText: { ...typography.label, color: colors.green },

  photoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  photoMetaText: { ...typography.caption, color: colors.verified },
  photoActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  runningTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.greenSurface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  runningTotalLabel: { ...typography.label, color: colors.green },
  runningTotalValue: { ...typography.numeric, fontSize: 18, color: colors.green },
  derivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  derivedLabel: { ...typography.bodyStrong, color: colors.ink },
  derivedHint: { ...typography.caption, fontSize: 12, color: colors.inkMuted, marginTop: 1 },
  derivedValue: { ...typography.numeric, fontSize: 18, color: colors.ink },
  notes: {
    ...typography.body,
    color: colors.ink,
    minHeight: 84,
    textAlignVertical: 'top',
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.base,
  },
  sendingText: { ...typography.bodyStrong, color: colors.green },
  footer: {
    ...typography.caption,
    fontSize: 12,
    color: colors.inkFaint,
    textAlign: 'center',
    lineHeight: 17,
  },
  successWrap: { alignItems: 'center', gap: spacing.base, width: '100%' },
  successIcon: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    backgroundColor: colors.verified,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },
  successTitle: { ...typography.display, color: colors.ink },
  successBody: {
    ...typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: spacing.md,
  },
  successCard: { width: '100%', marginTop: spacing.sm },
  successButton: { marginTop: spacing.sm },
  queuedIcon: { backgroundColor: colors.pending },
  reviewHint: {
    ...typography.caption,
    color: colors.inkMuted,
    lineHeight: 19,
    marginTop: spacing.md,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  reviewDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  reviewName: { ...typography.bodyStrong, color: colors.ink },
  reviewParty: { ...typography.caption, fontSize: 12, color: colors.inkMuted, marginTop: 1 },
  reviewVotes: { ...typography.numeric, fontSize: 20, color: colors.ink },
  reviewTotals: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.lineStrong,
  },
});
