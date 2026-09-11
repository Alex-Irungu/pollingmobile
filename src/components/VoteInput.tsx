/**
 * A single vote figure input.
 *
 * Details that matter at a polling station at midnight:
 *
 * - `numeric` keypad, so no one hunts for digits on an alphabetic keyboard.
 * - Large tabular figures, so a transcription can be checked against the paper
 *   column by column.
 * - Non-digits are stripped on input rather than rejected on submit. A stray
 *   character from a fat-fingered tap should never survive to become a
 *   validation error two screens later.
 * - The ballot number and party sit next to the name, because that is how the
 *   form is laid out and the agent is reading across it.
 */

import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { MIN_TOUCH, colors, radius, spacing, typography } from '../theme';

interface VoteInputProps {
  label: string;
  sublabel?: string;
  /** Shown in the leading chip, e.g. the ballot number. */
  badge?: string | number;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Emphasises the row: used for declared totals rather than candidates. */
  emphasis?: boolean;
  editable?: boolean;
}

export function VoteInput({
  label,
  sublabel,
  badge,
  value,
  onChange,
  placeholder = '0',
  autoFocus = false,
  emphasis = false,
  editable = true,
}: VoteInputProps) {
  function handleChange(text: string) {
    // Digits only. Leading zeros are trimmed so "007" does not get read as a
    // different figure from "7" when compared with the form.
    const digits = text.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
    // Five digits is more than any single stream can produce -- the largest
    // Kenyan polling stream holds well under 1,000 voters -- so this is a
    // guard against a stuck key, not a real limit.
    onChange(digits.slice(0, 5));
  }

  return (
    <View style={[styles.row, emphasis && styles.rowEmphasis]}>
      {badge !== undefined ? (
        <View style={[styles.badge, emphasis && styles.badgeEmphasis]}>
          <Text style={[styles.badgeText, emphasis && styles.badgeTextEmphasis]}>
            {badge}
          </Text>
        </View>
      ) : null}

      <View style={styles.labels}>
        <Text style={[styles.label, emphasis && styles.labelEmphasis]} numberOfLines={2}>
          {label}
        </Text>
        {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
      </View>

      <TextInput
        value={value}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        keyboardType="number-pad"
        returnKeyType="done"
        autoFocus={autoFocus}
        editable={editable}
        style={[styles.input, !editable && styles.inputReadOnly]}
        // Read out as a labelled field, since the visual label sits apart from
        // the input.
        accessibilityLabel={`${label} votes`}
        selectTextOnFocus
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowEmphasis: { borderBottomColor: colors.lineStrong },
  badge: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.goldSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEmphasis: { backgroundColor: colors.greenSurface },
  badgeText: { ...typography.label, fontSize: 13, color: colors.gold },
  badgeTextEmphasis: { color: colors.green },
  labels: { flex: 1 },
  label: { ...typography.bodyStrong, color: colors.ink },
  labelEmphasis: { color: colors.ink },
  sublabel: { ...typography.caption, fontSize: 12, color: colors.inkMuted, marginTop: 1 },
  input: {
    width: 92,
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    textAlign: 'right',
    paddingHorizontal: spacing.md,
    ...typography.numeric,
    color: colors.ink,
  },
  inputReadOnly: { backgroundColor: colors.surfaceAlt, color: colors.inkMuted },
});
