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
import { Image, type ImageStyle } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { ApiError } from '../../src/api/client';
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
import {
  colors,
  radius,
  shadow,
  spacing,
  typography,
} from '../../src/theme';

type Phase = 'form' | 'sending' | 'done';

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
  const { data: posting, isLoading, refetch } = usePosting();

  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [rejectedVotes, setRejectedVotes] = useState('');
  const [notes, setNotes] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');

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

  function confirmSubmit() {
    if (!validation.canSubmit || !station || !race) return;

    const summary = candidates
      .map((c) => `${c.full_name}: ${Number.parseInt(votes[c.id] ?? '0', 10) || 0}`)
      .join('\n');

    // A last explicit confirmation, showing the figures back. Once sent, the
    // agent cannot edit -- corrections go through the command centre -- so this
    // is the last chance to catch a mis-key.
    Alert.alert(
      'Send this result?',
      `${station.display_name}\n\n${summary}\n\nValid: ${validation.candidateTotal}\nRejected: ${rejectedVotes || '0'}\nTotal cast: ${totalCast}\n\nYou cannot edit this after sending.`,
      [
        { text: 'Check again', style: 'cancel' },
        { text: 'Send', style: 'default', onPress: submit },
      ],
    );
  }

  async function submit() {
    if (!station || !race || !photo) return;

    setPhase('sending');
    setSubmitError(null);

    try {
      // Upload the photo first and separately. If the submission then fails,
      // the image is already on the server and a retry does not re-send it --
      // which on a weak connection is the difference between one transfer and
      // several.
      setProgress('Uploading the form photo...');
      const attachment = await api.uploadFile({
        uri: photo.uri,
        name: `form-${station.iebc_code}.jpg`,
        mimeType: 'image/jpeg',
        purpose: 'RESULT_FORM',
      });

      setProgress('Sending the figures...');
      await api.submitResult({
        race: race.id,
        polling_station: station.id,
        total_registered_voters: registeredVoters ?? 0,
        total_valid_votes: validation.candidateTotal,
        total_rejected_votes: Number.parseInt(rejectedVotes, 10) || 0,
        total_votes_cast: totalCast,
        form_34a_photo: attachment.url,
        notes: notes.trim(),
        candidate_votes: candidates.map((candidate) => ({
          candidate: candidate.id,
          votes: Number.parseInt(votes[candidate.id] ?? '0', 10) || 0,
        })),
      });

      setPhase('done');
      // Refresh the posting so My Station shows the new submission state.
      refetch();
    } catch (error) {
      setPhase('form');
      setProgress('');
      setSubmitError(
        error instanceof ApiError
          ? error.isNetworkError
            ? 'No connection. Nothing was sent -- your figures are still here. Move to where you have signal and try again.'
            : error.message
          : 'Could not send the result. Please try again.',
      );
    }
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
        </Animated.View>
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
        <Text style={styles.headerTitle}>Submit Result</Text>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {station.display_name}
        </Text>
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
              onPress={confirmSubmit}
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
  headerTitle: { ...typography.title, color: colors.white },
  headerSubtitle: { ...typography.caption, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  scroll: { padding: spacing.base, gap: spacing.lg },
  block: { gap: spacing.sm },
  guard: { padding: spacing.base },
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
});
