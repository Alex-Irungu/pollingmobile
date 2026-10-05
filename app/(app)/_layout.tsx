/**
 * Signed-in tab navigation, in two shapes decided by the signed-in role.
 *
 * AGENT (the original app): My Station, Submit, Messages, Profile -- four
 * tabs and no more. An agent's jobs -- know your station, submit the result,
 * talk to the command centre, manage your own account -- and every extra
 * destination is something to get lost in at 11pm.
 *
 * ADMIN (command-centre roles): Dashboard, Events, Tally, People, Structure.
 * The ground-work slice of the web Command Centre, for the aspirant or
 * coordinator standing at a rally with no laptop. Office work (CSV imports,
 * user administration, verification) deliberately stays on the web.
 *
 * One navigator renders both: every screen is declared, and the role decides
 * which get a tab and which get href:null. The backend enforces authorization
 * regardless -- an agent token calling an admin endpoint 403s -- so this
 * gating is presentation, not security.
 */

import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { Tabs, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  conversationQueryKey,
  messagesQueryKey,
  useAdminUnread,
  useUnreadCount,
} from '../../src/hooks/useChat';
import { postingQueryKey } from '../../src/hooks/usePosting';
import { submissionHistoryQueryKey } from '../../src/hooks/useSubmissionHistory';
import { onOutboxEvent, startOutboxWatcher } from '../../src/services/messageOutbox';
import { registerForPushNotifications } from '../../src/services/pushNotifications';
import { onQueueSent, startQueueWatcher } from '../../src/services/submissionQueue';
import { useMe } from '../../src/hooks/useMe';
import { colors, spacing, typography } from '../../src/theme';
import { TabIcon } from '../../src/components/TabIcon';

export default function AppLayout() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { isAdmin, resolving } = useMe();
  const unread = useUnreadCount(!isAdmin);
  // Unanswered agents must be visible from any admin screen, not just the
  // inbox -- the badge rides the Dashboard tab because that is always on.
  const adminUnread = useAdminUnread(isAdmin);

  // The offline submission queue retries on its own for as long as the agent
  // is signed in. When a queued result finally lands, My Station and History
  // must reflect it without waiting for their next natural refetch.
  // Agent plumbing only: an admin has no submission queue or agent outbox.
  useEffect(() => {
    if (isAdmin) return;
    startQueueWatcher();
    startOutboxWatcher();
    const stopQueue = onQueueSent(() => {
      queryClient.invalidateQueries({ queryKey: postingQueryKey });
      queryClient.invalidateQueries({ queryKey: submissionHistoryQueryKey });
    });
    // When a queued message finally lands, pull the server copy so the
    // pending bubble swaps for the real one.
    const stopOutbox = onOutboxEvent(() => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
      queryClient.invalidateQueries({ queryKey: conversationQueryKey });
    });
    return () => {
      stopQueue();
      stopOutbox();
    };
  }, [queryClient, isAdmin]);

  // Pushes: register this device once signed in, and make tapping a
  // notification land on the conversation it announced. Agent-only -- the
  // push token endpoint lives under /agents/me/ and 403s for staff.
  useEffect(() => {
    if (isAdmin) return;
    void registerForPushNotifications();
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
      queryClient.invalidateQueries({ queryKey: conversationQueryKey });
      router.navigate('/(app)/chat');
    });
    return () => sub.remove();
  }, [queryClient, router, isAdmin]);

  // Android's 3-button and gesture nav bars both live in this inset. Without
  // adding it to the tab bar's height/padding, the bar renders *behind* the
  // system nav rather than above it, so the icons are unreachable.
  // Some Android builds report a smaller inset than the 3-button bar actually
  // occupies, which crops the tab labels; a 12dp floor costs nothing on
  // devices that report correctly and fixes the ones that lie.
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 0 : 12);

  // First launch on a fresh install: neither the cache nor the network has
  // said who this is. A blank frame beats mounting the wrong navigator and
  // tearing it down a moment later.
  if (resolving) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: [styles.tabBar, { height: 60 + bottomInset, paddingBottom: bottomInset }],
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      {/* ---- Agent tabs ---- */}
      <Tabs.Screen
        name="index"
        options={{
          href: isAdmin ? null : undefined,
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
          href: isAdmin ? null : undefined,
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
          href: isAdmin ? null : undefined,
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
          href: isAdmin ? null : undefined,
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

      {/* ---- Admin tabs ---- */}
      <Tabs.Screen
        name="admin"
        options={{
          href: isAdmin ? undefined : null,
          title: 'Dashboard',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="grid-outline"
              focusedName="grid"
              size={size}
              color={color}
              focused={focused}
              badgeCount={adminUnread}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          href: isAdmin ? undefined : null,
          title: 'Events',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="calendar-outline"
              focusedName="calendar"
              size={size}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="tally"
        options={{
          href: isAdmin ? undefined : null,
          title: 'Tally',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="stats-chart-outline"
              focusedName="stats-chart"
              size={size}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          href: isAdmin ? undefined : null,
          title: 'My People',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="people-outline"
              focusedName="people"
              size={size}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="structure"
        options={{
          href: isAdmin ? undefined : null,
          title: 'Structure',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="git-branch-outline"
              focusedName="git-branch"
              size={size}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      {/* Admin destinations reached from the Dashboard, not the tab bar:
          five tabs is already the ceiling for thumb reach. */}
      <Tabs.Screen name="agents" options={{ href: null }} />
      <Tabs.Screen name="inbox" options={{ href: null }} />

      <Tabs.Screen
        name="history"
        options={{
          // Reachable via router.push('/(app)/history') from Profile, but not
          // one of the tab bar's four daily-use destinations.
          href: null,
        }}
      />
      <Tabs.Screen
        name="diagnostics"
        options={{
          // For the bad day, via Profile -- not a daily destination.
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
