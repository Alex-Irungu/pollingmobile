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

import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useUnreadCount } from '../../src/hooks/useChat';
import { colors, spacing, typography } from '../../src/theme';

export default function AppLayout() {
  const unread = useUnreadCount();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Station',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'location' : 'location-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="submit"
        options={{
          title: 'Submit',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'document-text' : 'document-text-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size, focused }) => (
            <View>
              <Ionicons
                name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
                size={size}
                color={color}
              />
              {unread > 0 ? <View style={styles.badge} /> : null}
            </View>
          ),
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
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingTop: spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.sm,
  },
  tabItem: { paddingVertical: 2 },
  tabLabel: { ...typography.micro, fontSize: 11, letterSpacing: 0.2 },
  // A dot, not a count. The exact number of unread messages does not change
  // what the agent does, and a growing number is just noise.
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.gold,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
});
