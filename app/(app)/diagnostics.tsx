/**
 * Diagnostics -- the screen an agent reads down the phone to support.
 *
 * When someone calls saying "it's not working", the person helping them has
 * nothing to go on: not the app version, not whether the phone has signal,
 * not whether a submission is stuck. This screen puts every fact that call
 * needs in one place, in plain words, so the conversation becomes "read me
 * the Connection line" instead of twenty minutes of guessing.
 *
 * Reachable from Profile, deliberately not a tab: it is for the bad day,
 * not the daily routine.
 */

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Paths } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import * as Network from 'expo-network';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_BASE_URL } from '../../src/api/config';
import { getAccessToken } from '../../src/api/tokens';
import { Button } from '../../src/components/Button';
import { Card, DetailRow, SectionLabel } from '../../src/components/ui';
import { useOutbox } from '../../src/hooks/useOutbox';
import { useSubmissionQueue } from '../../src/hooks/useSubmissionQueue';
import { HIT_SLOP, colors, radius, spacing, typography } from '../../src/theme';

/** JWT expiry, read locally. Returns null for anything unexpected. */
function tokenExpiry(): Date | null {
  try {
    const token = getAccessToken();
    if (!token) return null;
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(
      globalThis.atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: number };
    return decoded.exp ? new Date(decoded.exp * 1000) : null;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

type PingResult =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'ok'; ms: number }
  | { state: 'failed' };

export default function DiagnosticsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queue = useSubmissionQueue();
  const outbox = useOutbox();

  const [network, setNetwork] = useState<Network.NetworkState | null>(null);
  const [ping, setPing] = useState<PingResult>({ state: 'idle' });
  const [disk, setDisk] = useState<{ free: number; total: number } | null>(null);

  useEffect(() => {
    Network.getNetworkStateAsync()
      .then(setNetwork)
      .catch(() => setNetwork(null));
    try {
      setDisk({ free: Paths.availableDiskSpace, total: Paths.totalDiskSpace });
    } catch {
      setDisk(null);
    }
  }, []);

  const runPing = useCallback(async () => {
    setPing({ state: 'running' });
    const started = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20_000);
      const response = await fetch(`${API_BASE_URL}/health/`, {
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      setPing(
        response.ok
          ? { state: 'ok', ms: Date.now() - started }
          : { state: 'failed' },
      );
    } catch {
      setPing({ state: 'failed' });
    }
  }, []);

  const expiry = tokenExpiry();

  const connectionLabel = !network
    ? 'Unknown'
    : network.isConnected
      ? `Connected (${network.type ?? 'unknown'})`
      : 'No connection';

  const pingLabel =
    ping.state === 'idle'
      ? '--'
      : ping.state === 'running'
        ? 'Testing…'
        : ping.state === 'ok'
          ? `OK, ${(ping.ms / 1000).toFixed(1)}s`
          : 'Unreachable';

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.green, colors.greenLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + spacing.md }]}
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.white} />
          </Pressable>
          <Text style={styles.headerTitle}>Diagnostics</Text>
          <View style={styles.headerSpacer} />
        </View>
        <Text style={styles.headerSubtitle}>
          If support asks, read them this screen.
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
          <SectionLabel>Connection</SectionLabel>
          <Card>
            <DetailRow label="Phone network" value={connectionLabel} />
            <DetailRow label="Server test" value={pingLabel} />
            <Button
              label={ping.state === 'running' ? 'Testing…' : 'Test connection to server'}
              variant="secondary"
              onPress={runPing}
              disabled={ping.state === 'running'}
              style={styles.pingButton}
            />
            {ping.state === 'failed' ? (
              <Text style={styles.hint}>
                The server did not answer. If the phone shows connected, the
                server may be waking up — wait a minute and test again.
              </Text>
            ) : null}
          </Card>
        </View>

        <View style={styles.block}>
          <SectionLabel>Waiting to send</SectionLabel>
          <Card>
            <DetailRow
              label="Result submission"
              value={
                queue.kind === 'idle'
                  ? 'Nothing waiting'
                  : queue.kind === 'pending'
                    ? queue.sending
                      ? 'Sending now…'
                      : 'Saved, waiting for signal'
                    : 'Needs correction'
              }
            />
            <DetailRow
              label="Messages"
              value={
                outbox.entries.length
                  ? `${outbox.entries.length} waiting${outbox.sending ? ', sending…' : ''}`
                  : 'Nothing waiting'
              }
            />
            {queue.kind === 'pending' && queue.record.lastError ? (
              <Text style={styles.hint}>Last attempt: {queue.record.lastError}</Text>
            ) : null}
          </Card>
        </View>

        <View style={styles.block}>
          <SectionLabel>App</SectionLabel>
          <Card>
            <DetailRow
              label="Version"
              value={Constants.expoConfig?.version ?? 'unknown'}
              mono
            />
            <DetailRow label="Server" value={API_BASE_URL} mono />
            <DetailRow
              label="Session valid until"
              value={
                expiry
                  ? expiry.toLocaleTimeString('en-KE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'No active session'
              }
            />
            <DetailRow
              label="Free storage"
              value={disk ? formatBytes(disk.free) : 'unknown'}
            />
          </Card>
          <Text style={styles.hint}>
            The session renews itself while you use the app — an expiry time in
            the past only matters if requests are failing.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerTitle: { ...typography.title, color: colors.white, flex: 1 },
  headerSpacer: { width: 22 },
  headerSubtitle: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.75)',
    marginTop: spacing.xs,
    marginLeft: 22 + spacing.md,
  },
  scroll: { padding: spacing.base, gap: spacing.lg },
  block: { gap: spacing.sm },
  pingButton: { marginTop: spacing.md },
  hint: {
    ...typography.caption,
    fontSize: 12,
    color: colors.inkMuted,
    lineHeight: 17,
    marginTop: spacing.sm,
  },
});
