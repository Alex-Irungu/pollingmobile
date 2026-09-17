/**
 * Signed-in tab navigation.
 *
 * Three tabs, and no more. An agent has three jobs -- know your station,
 * submit the result, talk to the command centre -- and every extra
 * destination is something to get lost in at 11pm. There is deliberately no
 * dashboard and no tally: the API would not serve them to a field agent
 * anyway, and an agent watching the running total is an agent under pressure
 * to report a helpful number.
 */

import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUnreadCount } from '../../src/hooks/useChat';
import { colors, spacing, typography } from '../../src/theme';
import { TabIcon } from '../../src/components/TabIcon';

export default function AppLayout() {
  const unread = useUnreadCount();
  const insets = useSafeAreaInsets();

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
