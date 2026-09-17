/**
 * Root layout: providers, and the gate between signed-in and signed-out.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as LocalAuthentication from 'expo-local-authentication';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError } from '../src/api/client';
import { getBiometricEnabled } from '../src/api/tokens';
import { PostLoginSplash } from '../src/components/PostLoginSplash';
import { AuthProvider, useAuth } from '../src/store/auth';
import { colors } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Field data is read repeatedly and changes rarely within a session, so
      // serve from cache and avoid burning the agent's data bundle.
      staleTime: 60_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (failureCount, error) => {
        // Retry transient network failures, never a deliberate server
        // rejection: re-sending a request the server already refused just
        // wastes battery and data.
        if (error instanceof ApiError && !error.isNetworkError) return false;
        return failureCount < 3;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Mutations are never retried automatically. A result submission must be
      // retried explicitly through the queue, where its idempotency key is
      // preserved -- a blind retry here could double-submit.
      retry: false,
    },
  },
});

/**
 * Redirects between the auth and app groups.
 *
 * Nothing renders until `status` leaves 'restoring', because reading the
 * keystore is async and showing the login screen first would flash it at every
 * agent on every launch.
 */
function NavigationGate() {
  const { status, enableBiometric } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const prevStatusRef = useRef<string>('restoring');
  const [splashVisible, setSplashVisible] = useState(false);
  const [showBiometricSetup, setShowBiometricSetup] = useState(false);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (status === 'restoring') return;
    SplashScreen.hideAsync().catch(() => undefined);

    const inAppGroup = segments[0] === '(app)';

    if (status === 'signedIn' && prev === 'signedOut') {
      // Fresh login — navigate immediately so the Stack stays alive, then show
      // the splash as an overlay on top of the already-mounted app group.
      router.replace('/(app)');
      (async () => {
        try {
          const [hasHardware, isEnrolled, alreadyEnabled] = await Promise.all([
            LocalAuthentication.hasHardwareAsync(),
            LocalAuthentication.isEnrolledAsync(),
            getBiometricEnabled(),
          ]);
          setShowBiometricSetup(hasHardware && isEnrolled && !alreadyEnabled);
        } catch {
          setShowBiometricSetup(false);
        }
        setSplashVisible(true);
      })();
      return;
    }

    if (status === 'signedIn' && !inAppGroup) {
      router.replace('/(app)');
    } else if (status === 'signedOut' && inAppGroup) {
      router.replace('/login');
    }
  }, [status, segments, router]);

  if (status === 'restoring') {
    return <View style={styles.splash} />;
  }

  return (
    <View style={styles.root}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="(app)" />
      </Stack>

      {/* Splash overlays the fully-mounted app so the navigator is never
          torn down — removing it caused useRouter/useSegments to lose
          context and crash on navigation. */}
      {splashVisible && (
        <View style={StyleSheet.absoluteFill}>
          <PostLoginSplash
            showBiometricSetup={showBiometricSetup}
            onEnableBiometric={enableBiometric}
            onComplete={() => setSplashVisible(false)}
          />
        </View>
      )}
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="light" />
            <NavigationGate />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: { flex: 1, backgroundColor: colors.green },
});
