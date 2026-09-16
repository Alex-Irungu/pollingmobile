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
import * as LocalAuthentication from 'expo-local-authentication';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../src/components/Button';
import { Card, DetailRow, LoadingState, SectionLabel } from '../../src/components/ui';
import {
  getBiometricEnabled,
  setBiometricEnabled as persistBiometricEnabled,
} from '../../src/api/tokens';
import { clearPostingCache, usePosting } from '../../src/hooks/usePosting';
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
  const { signOut } = useAuth();
  const { data, isLoading } = usePosting();

  const [signingOut, setSigningOut] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [hardware, enrolled, enabled, locGranted] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        getBiometricEnabled(),
        hasLocationPermission(),
      ]);
      setBiometricSupported(hardware && enrolled);
      setBiometricEnabledState(enabled);
      setLocationGranted(locGranted);
    })();
  }, []);

  const handleToggleBiometric = useCallback(
    async (next: boolean) => {
      setBiometricBusy(true);
      try {
        if (next) {
          // Prove the device can actually authenticate before committing to
          // gating the app behind it -- otherwise a phone with a broken
          // fingerprint sensor would lock its agent out entirely.
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Confirm it is you',
            disableDeviceFallback: false,
          });
          if (!result.success) return;
        }
        await persistBiometricEnabled(next);
        setBiometricEnabledState(next);
      } finally {
        setBiometricBusy(false);
      }
    },
    [],
  );

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
          <SectionLabel>Security</SectionLabel>
          <Card>
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name="finger-print-outline" size={20} color={colors.green} />
              </View>
              <View style={styles.rowLabels}>
                <Text style={styles.rowTitle}>Unlock with fingerprint / face</Text>
                <Text style={styles.rowSubtitle}>
                  {biometricSupported
                    ? 'Require this each time you open the app.'
                    : 'Not available on this device.'}
                </Text>
              </View>
              {biometricBusy ? (
                <ActivityIndicator color={colors.green} />
              ) : (
                <Switch
                  value={biometricEnabled}
                  onValueChange={handleToggleBiometric}
                  disabled={!biometricSupported}
                  trackColor={{ true: colors.green, false: colors.line }}
                />
              )}
            </View>
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
  locationButton: { marginTop: spacing.base },
  logoutButton: { marginTop: spacing.sm },
});
