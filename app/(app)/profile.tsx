/**
 * Profile.
 *
 * Where an agent checks their own details, and where the two opt-in device
 * features live: biometric unlock and location sharing. Both are explained
 * here rather than sprung on the agent as a bare OS dialog -- an agent who
 * understands why the command centre wants their location is one who leaves
 * it switched on.
 */

import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as api from '../../src/api/endpoints';
import { Button } from '../../src/components/Button';
import { Card, DetailRow, LoadingState, SectionLabel } from '../../src/components/ui';
import { usePosting } from '../../src/hooks/usePosting';
import { submissionHistoryQueryKey } from '../../src/hooks/useSubmissionHistory';
import {
  hasLocationPermission,
  requestLocationPermissions,
  startLocationTracking,
} from '../../src/services/locationTracking';
import { useAuth } from '../../src/store/auth';
import { colors, radius, spacing, typography } from '../../src/theme';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

const LEVEL_LABEL: Record<string, string> = {
  POLLING_STATION: 'Polling station agent',
  WARD: 'Ward agent',
  CONSTITUENCY: 'Constituency agent',
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const { data, isLoading } = usePosting();

  const [signingOut, setSigningOut] = useState(false);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);

  useEffect(() => {
    hasLocationPermission().then(setLocationGranted);
  }, []);

  // Warm the History screen's cache in the background, so tapping into it
  // shows data immediately instead of a spinner. Cheap and harmless if the
  // agent never opens it -- one small GET, deduplicated by React Query if a
  // fetch is already in flight or the cache is still fresh.
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

  const handleEnableLocation = useCallback(async () => {
    setLocationBusy(true);
    try {
      const granted = await requestLocationPermissions();
      setLocationGranted(granted);
      if (granted) {
        startLocationTracking();
      } else {
        Alert.alert(
          'Location permission needed',
          'Sentinel could not get location access. Enable it from your phone\'s Settings to let the command centre find you if something goes wrong.',
        );
      }
    } finally {
      setLocationBusy(false);
    }
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Log out?',
      'You will need your email and password to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            await signOut();
          },
        },
      ],
    );
  }, [signOut]);

  if (isLoading && !data) {
    return <LoadingState message="Loading your profile" />;
  }

  const agent = data?.agent ?? null;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.green, colors.greenLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + spacing.lg }]}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(agent?.full_name ?? 'Agent')}</Text>
        </View>
        <Text style={styles.agentName} numberOfLines={1}>
          {agent?.full_name ?? 'Field agent'}
        </Text>
        <Text style={styles.agentLevel}>
          {LEVEL_LABEL[agent?.level ?? ''] ?? 'Field agent'}
        </Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xxxl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.block}>
          <SectionLabel>Details</SectionLabel>
          <Card>
            <DetailRow label="Full name" value={agent?.full_name} />
            <DetailRow label="Phone" value={agent?.phone_number} />
            <DetailRow label="Email" value={agent?.email} />
            <DetailRow
              label="Role"
              value={agent ? LEVEL_LABEL[agent.level] ?? agent.level : null}
            />
            {data?.polling_station ? (
              <DetailRow label="Station" value={data.polling_station.display_name} />
            ) : null}
          </Card>
        </View>

        <View style={styles.block}>
          <SectionLabel>Safety</SectionLabel>
          <Card>
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name="location-outline" size={20} color={colors.green} />
              </View>
              <View style={styles.rowLabels}>
                <Text style={styles.rowTitle}>Location sharing</Text>
                <Text style={styles.rowSubtitle}>
                  {locationGranted
                    ? 'On. The command centre can find you if you go silent.'
                    : 'Off. Turn this on so the command centre can reach you if something goes wrong.'}
                </Text>
              </View>
            </View>
            {!locationGranted ? (
              <Button
                label="Turn on location sharing"
                onPress={handleEnableLocation}
                loading={locationBusy}
                variant="secondary"
                style={styles.locationButton}
              />
            ) : null}
          </Card>
        </View>

        <View style={styles.block}>
          <SectionLabel>Help</SectionLabel>
          <Card>
            <Pressable
              onPress={() => router.push('/(app)/history')}
              style={styles.linkRow}
              accessibilityRole="button"
            >
              <Ionicons name="time-outline" size={20} color={colors.green} />
              <Text style={styles.linkText}>Submission history</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
            </Pressable>
            <View style={styles.linkDivider} />
            <Pressable
              onPress={() => router.push('/(app)/diagnostics')}
              style={styles.linkRow}
              accessibilityRole="button"
            >
              <Ionicons name="pulse-outline" size={20} color={colors.green} />
              <View style={styles.linkLabels}>
                <Text style={styles.linkText}>Diagnostics</Text>
                <Text style={styles.linkSubtitle}>
                  Connection, version and anything waiting to send — for when
                  you call support.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
            </Pressable>
          </Card>
        </View>

        <Button
          label="Logout"
          onPress={handleLogout}
          variant="danger"
          loading={signingOut}
          icon={<Ionicons name="log-out-outline" size={18} color={colors.white} />}
          style={styles.logoutButton}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: {
    alignItems: 'center',
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  avatarText: { ...typography.title, color: colors.white },
  agentName: { ...typography.title, color: colors.white, textAlign: 'center' },
  agentLevel: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  scroll: { padding: spacing.base, gap: spacing.base },
  block: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.greenSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabels: { flex: 1 },
  rowTitle: { ...typography.bodyStrong, color: colors.ink },
  rowSubtitle: { ...typography.caption, color: colors.inkMuted, marginTop: 1, lineHeight: 17 },
  locationButton: { marginTop: spacing.md },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  linkDivider: { height: 1, backgroundColor: colors.line },
  linkLabels: { flex: 1 },
  linkText: { ...typography.bodyStrong, color: colors.ink, flex: 1 },
  linkSubtitle: {
    ...typography.caption,
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: 1,
    lineHeight: 16,
  },
  logoutButton: { marginTop: spacing.sm },
});
