/**
 * Root layout: providers, and the gate between signed-in and signed-out.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError } from '../src/api/client';
import {
  getBiometricEnabled,
  getBiometricOfferDeclined,
  setBiometricOfferDeclined,
} from '../src/api/tokens';
import { BiometricSetupSheet } from '../src/components/BiometricSetupSheet';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { getBiometricCapability } from '../src/services/biometrics';
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
  const { status, lastSignInMethod, enableBiometric } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const prevStatusRef = useRef<string>('restoring');
  const [offerBiometric, setOfferBiometric] = useState(false);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (status === 'restoring') return;
    SplashScreen.hideAsync().catch(() => undefined);

    const inAppGroup = segments[0] === '(app)';

    if (status === 'signedIn' && prev === 'signedOut') {
      // Straight in. Nothing is allowed to stand between a successful sign-in
      // and the agent's station -- the work they signed in to do is on the
      // other side of this call.
      router.replace('/(app)');

      // Then, and only for a password sign-in, consider offering fingerprint
      // setup. Someone who just used their fingerprint has nothing to enable,
      // and every condition below is read from storage or from the cached
      // capability, so no native biometric call is made here.
      if (lastSignInMethod !== 'password') return;

      (async () => {
        const [{ usable }, alreadyEnabled, declined] = await Promise.all([
          getBiometricCapability(),
          getBiometricEnabled(),
          getBiometricOfferDeclined(),
        ]);
        setOfferBiometric(usable && !alreadyEnabled && !declined);
      })();
      return;
    }

    if (status === 'signedIn' && !inAppGroup) {
      router.replace('/(app)');
    } else if (status === 'signedOut' && inAppGroup) {
      router.replace('/login');
    }
  }, [status, segments, router, lastSignInMethod]);

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

      {/* Overlays the fully-mounted app so the navigator is never torn down —
          removing it from the tree caused useRouter/useSegments to lose
          context and crash on navigation. */}
      {offerBiometric && (
        <BiometricSetupSheet
          onEnable={enableBiometric}
          onDismiss={(declined) => {
            setOfferBiometric(false);
            if (declined) void setBiometricOfferDeclined();
          }}
        />
      )}
    </View>
  );
}

export default function RootLayout() {
  return (
    // Outside every provider on purpose: a failure while building the query
    // client, restoring the session or mounting the navigator must still land
    // on the recovery screen rather than closing the app.
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: { flex: 1, backgroundColor: colors.green },
});
