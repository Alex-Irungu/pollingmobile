/**
 * Signed-in tab navigation.
 *
 * Four tabs, and no more. An agent's jobs -- know your station, submit the
 * result, talk to the command centre, manage your own account -- and every
 * extra destination is something to get lost in at 11pm. The live tally the
 * campaign asked for lives on My Station rather than as a fifth tab: ambient
 * context on the screen the app opens to, not a dashboard to get lost in.
 */

import { useQueryClient } from '@tanstack/react-query';
import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUnreadCount } from '../../src/hooks/useChat';
import { postingQueryKey } from '../../src/hooks/usePosting';
import { submissionHistoryQueryKey } from '../../src/hooks/useSubmissionHistory';
import { onQueueSent, startQueueWatcher } from '../../src/services/submissionQueue';
import { colors, spacing, typography } from '../../src/theme';
import { TabIcon } from '../../src/components/TabIcon';

export default function AppLayout() {
  const unread = useUnreadCount();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  // The offline submission queue retries on its own for as long as the agent
  // is signed in. When a queued result finally lands, My Station and History
  // must reflect it without waiting for their next natural refetch.
  useEffect(() => {
    startQueueWatcher();
    return onQueueSent(() => {
      queryClient.invalidateQueries({ queryKey: postingQueryKey });
      queryClient.invalidateQueries({ queryKey: submissionHistoryQueryKey });
    });
  }, [queryClient]);

  // Android's 3-button and gesture nav bars both live in this inset. Without
  // adding it to the tab bar's height/padding, the bar renders *behind* the
  // system nav rather than above it, so the icons are unreachable.
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 0 : spacing.sm);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: [styles.tabBar, { height: 56 + bottomInset, paddingBottom: bottomInset }],
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Station',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="location-outline"
              focusedName="location"
              size={size}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="submit"
        options={{
          title: 'Submit',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="document-text-outline"
              focusedName="document-text"
              size={size}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="chatbubbles-outline"
              focusedName="chatbubbles"
              size={size}
              color={color}
              focused={focused}
              badgeCount={unread}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="person-outline"
              focusedName="person"
              size={size}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          // Reachable via router.push('/(app)/history') from Profile, but not
          // one of the tab bar's four daily-use destinations.
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  tabItem: { paddingVertical: 2 },
  tabLabel: { ...typography.micro, fontSize: 11, letterSpacing: 0.2 },
});
