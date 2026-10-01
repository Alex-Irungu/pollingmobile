/**
 * "You're offline" strip.
 *
 * The app is deliberately offline-first -- queues, caches, retries -- but all
 * of that is invisible, and invisible resilience looks like a broken app when
 * a refresh silently returns stale data. One amber strip that slides in under
 * the status bar says the quiet part out loud: we know, your work is safe,
 * it sends when the signal returns.
 *
 * Overlay rather than in-flow: every screen manages its own top inset, and an
 * in-flow banner would shove all of them down.
 */

import { Ionicons } from '@expo/vector-icons';
import { useNetworkState } from 'expo-network';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '../theme';

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const network = useNetworkState();

  // undefined = still asking the OS; only declare offline on a firm "no".
  const offline =
    network.isConnected === false || network.isInternetReachable === false;

  if (!offline) return null;

  return (
    <Animated.View
      entering={SlideInUp.duration(220)}
      exiting={SlideOutUp.duration(220)}
      style={[styles.strip, { paddingTop: insets.top + 4 }]}
      accessibilityRole="alert"
      accessibilityLabel="You are offline. Saved data is shown and work is queued."
      pointerEvents="none"
    >
      <Ionicons name="cloud-offline-outline" size={14} color={colors.white} />
      <Text style={styles.text}>Offline — showing saved data, work is queued</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  strip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.pending,
    paddingBottom: 6,
    paddingHorizontal: spacing.base,
  },
  text: { ...typography.label, fontSize: 12, color: colors.white },
});
