/**
 * "A newer build exists" banner.
 *
 * Two registers, deliberately far apart. 'behind' is a calm one-liner an
 * agent can ignore during counting -- updating mid-shift is sometimes the
 * wrong call. 'too_old' is loud, because a build below the campaign's
 * minimum may be missing the fix that keeps results flowing, and quiet
 * politeness would be a disservice.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useVersionCheck } from '../hooks/useVersionCheck';
import { colors, radius, spacing, typography } from '../theme';

export function UpdateBanner() {
  const { verdict, latestVersion, downloadUrl } = useVersionCheck();

  if (verdict === 'current') return null;

  const urgent = verdict === 'too_old';

  return (
    <Pressable
      onPress={() => {
        if (downloadUrl) Linking.openURL(downloadUrl).catch(() => undefined);
      }}
      disabled={!downloadUrl}
      style={[styles.container, urgent ? styles.urgent : styles.calm]}
      accessibilityRole="button"
      accessibilityLabel={`App update available, version ${latestVersion ?? ''}. Tap to download.`}
    >
      <Ionicons
        name={urgent ? 'alert-circle' : 'arrow-up-circle-outline'}
        size={20}
        color={urgent ? colors.rejected : colors.info}
      />
      <View style={styles.flex}>
        <Text style={[styles.title, urgent && styles.titleUrgent]}>
          {urgent ? 'This version is too old' : 'A newer version is available'}
        </Text>
        <Text style={styles.body}>
          {urgent
            ? `Update to ${latestVersion ?? 'the latest build'} before election day — this build may not work correctly.`
            : `Version ${latestVersion ?? ''} is out. Update when you have a moment and good signal.`}
        </Text>
      </View>
      {downloadUrl ? (
        <Ionicons name="chevron-forward" size={16} color={colors.inkMuted} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  calm: { backgroundColor: colors.infoSurface, borderColor: colors.info },
  urgent: { backgroundColor: colors.rejectedSurface, borderColor: colors.rejected },
  title: { ...typography.bodyStrong, color: colors.ink },
  titleUrgent: { color: colors.rejected },
  body: {
    ...typography.caption,
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: 1,
    lineHeight: 16,
  },
});
