/**
 * Root layout: providers, and the gate between signed-in and signed-out.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError } from '../src/api/client';
import { LockScreen } from '../src/components/LockScreen';
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
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'restoring') return;

    SplashScreen.hideAsync().catch(() => undefined);

    const inAppGroup = segments[0] === '(app)';

    if (status === 'signedIn' && !inAppGroup) {
      router.replace('/(app)');
    } else if (status === 'signedOut' && inAppGroup) {
      router.replace('/login');
    }
  }, [status, segments, router]);

  if (status === 'restoring') {
    return <View style={styles.splash} />;
  }

  // A valid session waiting on Face/Touch ID. Rendered in place of the
  // navigator entirely -- there is nothing behind it to protect if the app
  // group were still reachable underneath.
  if (status === 'locked') {
    return <LockScreen />;
  }

  return (
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
