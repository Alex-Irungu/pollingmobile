/**
 * "What to do today" -- the election day walked through as stages.
 *
 * For a first-time agent, election morning is a phone, a lanyard and nerves.
 * This strip answers the only question that matters at any given hour: what
 * am I supposed to be doing *right now*? Stages advance by the clock (polls
 * open at 6am, counting starts after 5pm close) and by state (a submitted or
 * queued result ends the day), because the app cannot know when this
 * particular station's count actually finishes -- the agent can.
 *
 * Before election day it collapses to a countdown; after the result is in,
 * to a quiet "stay reachable". It never demands interaction: it is a map,
 * not a form.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, SectionLabel } from './ui';
import { colors, radius, spacing, typography } from '../theme';

const POLLS_OPEN_HOUR = 6;
const POLLS_CLOSE_HOUR = 17;

interface Stage {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint: string;
}

const STAGES: Stage[] = [
  {
    icon: 'walk-outline',
    title: 'Arrive at your station',
    hint: 'Be there before 6:00 am. Introduce yourself to the presiding officer and other agents.',
  },
  {
    icon: 'people-outline',
    title: 'Voting — polls are open',
    hint: 'Observe through the day. Report anything unusual to the command centre in Messages.',
  },
  {
    icon: 'eye-outline',
    title: 'Counting',
    hint: 'Stay where you can see every ballot counted. Your figures must come from the declared form, not memory.',
  },
  {
    icon: 'camera-outline',
    title: 'Photograph & submit',
    hint: 'When the form is signed, photograph it and send the figures from the Submit tab.',
  },
  {
    icon: 'checkmark-done-outline',
    title: 'Done — stay reachable',
    hint: 'Your result is in. Keep your phone on until the command centre stands you down.',
  },
];

function daysUntil(dateString: string): number {
  const target = new Date(`${dateString}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function currentStageIndex(resultIn: boolean): number {
  if (resultIn) return 4;
  const hour = new Date().getHours();
  if (hour < POLLS_OPEN_HOUR) return 0;
  if (hour < POLLS_CLOSE_HOUR) return 1;
  // After close the app cannot tell counting from form-signed; show counting
  // and let the hint point at the next step.
  return 2;
}

export function DayChecklist({
  electionDate,
  resultIn,
}: {
  electionDate: string;
  resultIn: boolean;
}) {
  const days = daysUntil(electionDate);

  // Long before the day: a countdown, not a checklist nobody can act on yet.
  if (days > 0) {
    return (
      <View style={styles.block}>
        <Card style={styles.countdownCard}>
          <Ionicons name="calendar-outline" size={20} color={colors.green} />
          <View style={styles.flex}>
            <Text style={styles.countdownTitle}>
              {days === 1 ? 'Election day is tomorrow' : `${days} days to election day`}
            </Text>
            <Text style={styles.countdownHint}>
              On the day, this screen will walk you through each step.
            </Text>
          </View>
        </Card>
      </View>
    );
  }

  // Well after the day with nothing pending, the checklist has no job left.
  if (days < -1 && !resultIn) return null;

  const current = currentStageIndex(resultIn);

  return (
    <View style={styles.block}>
      <SectionLabel>Your day</SectionLabel>
      <Card>
        {STAGES.map((stage, index) => {
          const isDone = index < current || (resultIn && index <= 4);
          const isCurrent = index === current;
          return (
            <View key={stage.title} style={styles.stageRow}>
              <View style={styles.railColumn}>
                <View
                  style={[
                    styles.dot,
                    isDone && styles.dotDone,
                    isCurrent && styles.dotCurrent,
                  ]}
                >
                  {isDone ? (
                    <Ionicons name="checkmark" size={12} color={colors.white} />
                  ) : (
                    <Ionicons
                      name={stage.icon}
                      size={12}
                      color={isCurrent ? colors.white : colors.inkFaint}
                    />
                  )}
                </View>
                {index < STAGES.length - 1 ? (
                  <View style={[styles.rail, isDone && styles.railDone]} />
                ) : null}
              </View>
              <View style={[styles.stageBody, isCurrent && styles.stageBodyCurrent]}>
                <Text
                  style={[
                    styles.stageTitle,
                    isDone && styles.stageTitleDone,
                    isCurrent && styles.stageTitleCurrent,
                  ]}
                >
                  {stage.title}
                </Text>
                {isCurrent ? <Text style={styles.stageHint}>{stage.hint}</Text> : null}
              </View>
            </View>
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  flex: { flex: 1 },
  countdownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  countdownTitle: { ...typography.bodyStrong, color: colors.ink },
  countdownHint: {
    ...typography.caption,
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: 1,
  },
  stageRow: { flexDirection: 'row', gap: spacing.md },
  railColumn: { alignItems: 'center', width: 24 },
  dot: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.verified, borderColor: colors.verified },
  dotCurrent: { backgroundColor: colors.green, borderColor: colors.green },
  rail: {
    width: 2,
    flex: 1,
    minHeight: 12,
    backgroundColor: colors.line,
    marginVertical: 2,
  },
  railDone: { backgroundColor: colors.verified },
  stageBody: { flex: 1, paddingBottom: spacing.md },
  stageBodyCurrent: {
    backgroundColor: colors.greenSurface,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  stageTitle: { ...typography.bodyStrong, color: colors.inkFaint, paddingTop: 3 },
  stageTitleDone: { color: colors.inkMuted },
  stageTitleCurrent: { color: colors.green, paddingTop: 0 },
  stageHint: {
    ...typography.caption,
    fontSize: 12,
    color: colors.inkMuted,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
});
