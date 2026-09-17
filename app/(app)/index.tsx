/**
 * My Station.
 *
 * The home screen answers one question at a glance: am I set up, and what is
 * the state of my result? Everything else is secondary detail an agent can
 * scroll to.
 *
 * The station's IEBC code is shown prominently and in tabular figures because
 * an agent checking they are at the right stream compares it character by
 * character against the paperwork in front of them.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '../../src/api/client';
import { Button } from '../../src/components/Button';
import {
  Banner,
  Card,
  DetailRow,
  LoadingState,
  SectionLabel,
  StatusPill,
  formatNumber,
} from '../../src/components/ui';
import { clearPostingCache, usePosting } from '../../src/hooks/usePosting';
import { useAuth } from '../../src/store/auth';
import {
  HIT_SLOP,
  colors,
  radius,
  shadow,
  spacing,
  typography,
} from '../../src/theme';

export default function MyStationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();
  const { data, isLoading, error, refetch, isRefetching } = usePosting();

  const [signingOut, setSigningOut] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading && !data) {
      slowTimer.current = setTimeout(() => setSlowLoad(true), 8000);
    } else {
      if (slowTimer.current) clearTimeout(slowTimer.current);
      setSlowLoad(false);
    }
    return () => { if (slowTimer.current) clearTimeout(slowTimer.current); };
  }, [isLoading, data]);

  const handleSignOut = useCallback(() => {
    Alert.alert(
      'Sign out?',
      'You will need your email and password to sign in again.',
      [
        { text: 'Stay signed in', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            // Drop the cached posting: the next agent to use this device must
            // not see the previous agent's station.
            await clearPostingCache();
            await signOut();
          },
        },
      ],
    );
  }, [signOut]);

  if (isLoading && !data) {
    return (
      <LoadingState
        message="Loading your station"
        subMessage={slowLoad ? 'Server is starting up — this happens after a quiet period. Usually ready in under a minute.' : undefined}
      />
    );
  }

  // A 403 here means the account is real but is not an active agent -- the
  // command centre has not finished registering them, or has suspended them.
  // That needs a different message from a network failure.
  const notAnAgent = error instanceof ApiError && error.status === 403;

  const station = data?.polling_station ?? null;
  const race = data?.race ?? null;
  const submission = data?.existing_submission ?? null;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.green, colors.greenLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.headerBackdrop, { paddingTop: insets.top + spacing.base }]}
      >
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <Text style={styles.greeting}>Signed in as</Text>
            <Text style={styles.agentName} numberOfLines={1}>
              {data?.agent.full_name ?? 'Field agent'}
            </Text>
          </View>
          <Pressable
            onPress={handleSignOut}
            hitSlop={HIT_SLOP}
            style={styles.signOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            disabled={signingOut}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.white} />
          </Pressable>
        </View>
      </LinearGradient>

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
        {notAnAgent ? (
          <View style={styles.block}>
            <Banner
              tone="warning"
              title="Not registered as an agent"
              message="This account is not an active field agent. Ask the command centre to check your registration, then pull down to refresh."
            />
          </View>
        ) : null}

        {error && !notAnAgent && !data ? (
          <View style={styles.block}>
            <Banner
              tone="error"
              title="Could not load your station"
              message={
                error instanceof ApiError
                  ? error.message
                  : 'Something went wrong. Pull down to try again.'
              }
              action={{ label: 'Try again', onPress: () => refetch() }}
            />
          </View>
        ) : null}

        {station ? (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.stationCard}>
            <View style={styles.stationTop}>
              <View style={styles.stationIcon}>
                <Ionicons name="location" size={18} color={colors.green} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.stationLabel}>YOUR POLLING STREAM</Text>
                <Text style={styles.stationName}>{station.name}</Text>
                {station.stream !== null ? (
                  <Text style={styles.streamText}>Stream {station.stream}</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.codeStrip}>
              <Text style={styles.codeLabel}>IEBC CODE</Text>
              <Text style={styles.codeValue} selectable>
                {station.iebc_code}
              </Text>
            </View>

            <View style={styles.statRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {formatNumber(station.registered_voters)}
                </Text>
                <Text style={styles.statLabel}>Registered voters</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue} numberOfLines={1}>
                  {station.ward ?? '--'}
                </Text>
                <Text style={styles.statLabel}>Ward</Text>
              </View>
            </View>
          </Animated.View>
        ) : !notAnAgent && !error ? (
          <View style={styles.block}>
            <Banner
              tone="warning"
              title="No station assigned yet"
              message="You are registered, but the command centre has not posted you to a polling stream. You cannot submit results until they do."
            />
          </View>
        ) : null}

        {submission ? (
          <View style={styles.block}>
            <SectionLabel>Your submission</SectionLabel>
            <Card>
              <View style={styles.submissionHeader}>
                <StatusPill status={submission.status} />
              </View>

              {submission.rejection_reason ? (
                <View style={styles.reasonWrap}>
                  <Banner
                    tone="error"
                    title="Correction needed"
                    message={submission.rejection_reason}
                  />
                </View>
              ) : null}

              {/* Copy per status, with a neutral fallback. The status vocabulary
                  has changed once already and an installed app cannot be updated
                  mid-election, so an unrecognised value must still say something
                  true rather than nothing. */}
              <Text style={styles.submissionNote}>
                {submission.status === 'VERIFIED'
                  ? 'The command centre has verified your result. Nothing further is needed.'
                  : submission.status === 'REJECTED'
                    ? 'The command centre could not accept this result. Check Messages.'
                    : 'Your result has reached the command centre. They will review it.'}
              </Text>

              <DetailRow
                label="Submitted"
                value={new Date(submission.submitted_at).toLocaleString('en-KE')}
              />
            </Card>
          </View>
        ) : station && race ? (
          <View style={styles.block}>
            <Card>
              <View style={styles.ctaHeader}>
                <Ionicons name="document-text-outline" size={20} color={colors.green} />
                <Text style={styles.ctaTitle}>Result not sent yet</Text>
              </View>
              <Text style={styles.ctaBody}>
                When the count is done and you have your copy of the declaration
                form, photograph it and enter the figures.
              </Text>
              <Button
                label="Submit result"
                onPress={() => router.push('/(app)/submit')}
                style={styles.ctaButton}
              />
            </Card>
          </View>
        ) : null}

        {race ? (
          <View style={styles.block}>
            <SectionLabel>Race you report on</SectionLabel>
            <Card>
              <Text style={styles.raceTitle}>{race.title}</Text>
              <DetailRow label="Election" value={race.election} />
              <DetailRow
                label="Election day"
                value={new Date(race.election_date).toLocaleDateString('en-KE', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              />
              {/* Shown only when set. The race-to-form mapping is legally
                  unresolved, so an invented code here would be worse than none. */}
              {race.result_form_code ? (
                <DetailRow label="Form" value={race.result_form_code} mono />
              ) : null}
            </Card>
          </View>
        ) : null}

        {data?.candidates.length ? (
          <View style={styles.block}>
            <SectionLabel>Ballot ({data.candidates.length} candidates)</SectionLabel>
            <Card>
              {data.candidates.map((candidate, index) => (
                <View
                  key={candidate.id}
                  style={[
                    styles.candidateRow,
                    index < data.candidates.length - 1 && styles.candidateDivider,
                  ]}
                >
                  <View style={styles.ballotNumber}>
                    <Text style={styles.ballotNumberText}>
                      {candidate.ballot_number ?? index + 1}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.candidateName}>{candidate.full_name}</Text>
                    <Text style={styles.candidateParty}>
                      {candidate.party_abbreviation || 'INDEPENDENT'}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        <Animated.Text entering={FadeIn.delay(300)} style={styles.footer}>
          Sentinel is an internal campaign tool. Figures recorded here are the
          campaign's own record and are not official IEBC results.
        </Animated.Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  headerBackdrop: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  greeting: {
    ...typography.micro,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
  },
  agentName: { ...typography.title, color: colors.white, marginTop: 2 },
  signOut: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { padding: spacing.base, gap: spacing.base },
  block: { gap: spacing.sm },
  stationCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.base,
    ...shadow.md,
  },
  stationTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stationIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.greenSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stationLabel: { ...typography.micro, color: colors.inkFaint },
  stationName: { ...typography.heading, color: colors.ink, marginTop: 3 },
  streamText: { ...typography.caption, color: colors.inkMuted, marginTop: 1 },
  codeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.base,
  },
  codeLabel: { ...typography.micro, color: colors.inkFaint },
  codeValue: {
    ...typography.bodyStrong,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.6,
  },
  statRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.base },
  stat: { flex: 1 },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.line,
    marginHorizontal: spacing.md,
  },
  statValue: { ...typography.numeric, fontSize: 18, color: colors.ink },
  statLabel: { ...typography.caption, fontSize: 12, color: colors.inkMuted, marginTop: 1 },
  submissionHeader: { marginBottom: spacing.sm },
  submissionNote: {
    ...typography.caption,
    color: colors.inkMuted,
    lineHeight: 19,
    marginBottom: spacing.xs,
  },
  reasonWrap: { marginBottom: spacing.md },
  ctaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  ctaTitle: { ...typography.heading, color: colors.ink },
  ctaBody: {
    ...typography.caption,
    color: colors.inkMuted,
    lineHeight: 19,
    marginBottom: spacing.base,
  },
  ctaButton: { marginTop: spacing.xs },
  raceTitle: { ...typography.bodyStrong, color: colors.ink, marginBottom: spacing.xs },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  candidateDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  ballotNumber: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.goldSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ballotNumberText: { ...typography.label, color: colors.gold, fontSize: 13 },
  candidateName: { ...typography.bodyStrong, color: colors.ink },
  candidateParty: { ...typography.caption, fontSize: 12, color: colors.inkMuted, marginTop: 1 },
  footer: {
    ...typography.caption,
    fontSize: 12,
    color: colors.inkFaint,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: spacing.base,
    marginTop: spacing.sm,
  },
});
