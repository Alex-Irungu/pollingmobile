/**
 * Animated tab bar icon.
 *
 * A focused tab springs up slightly with a soft pill behind it, rather than
 * just swapping colour. It is a small, cheap animation (opacity + scale only,
 * no layout thrash) so it stays smooth on low-end Android, per the theme's
 * "nothing animates on a timer" constraint -- this only animates on the
 * focus transition itself.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { ColorValue, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius } from '../theme';

interface TabIconProps {
  name: keyof typeof Ionicons.glyphMap;
  focusedName: keyof typeof Ionicons.glyphMap;
  color: ColorValue;
  size: number;
  focused: boolean;
  /** Unread count. Renders as a red bubble with the number, capped at "9+". */
  badgeCount?: number;
}

export function TabIcon({
  name,
  focusedName,
  color,
  size,
  focused,
  badgeCount = 0,
}: TabIconProps) {
  const scale = useSharedValue(focused ? 1 : 0.94);
  const pillOpacity = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    scale.value = withSpring(focused ? 1 : 0.94, { damping: 14, stiffness: 220 });
    pillOpacity.value = withTiming(focused ? 1 : 0, { duration: 160 });
  }, [focused, scale, pillOpacity]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pillStyle = useAnimatedStyle(() => ({
    opacity: pillOpacity.value,
  }));

  const badgeScale = useSharedValue(badgeCount > 0 ? 1 : 0);

  useEffect(() => {
    badgeScale.value = withSpring(badgeCount > 0 ? 1 : 0, {
      damping: 12,
      stiffness: 260,
    });
  }, [badgeCount, badgeScale]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
  }));

  const label = badgeCount > 9 ? '9+' : String(badgeCount);

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.pill, pillStyle]} />
      <Animated.View style={iconStyle}>
        <Ionicons name={focused ? focusedName : name} size={size} color={color} />
      </Animated.View>
      {badgeCount > 0 ? (
        <Animated.View
          style={[
            styles.badge,
            badgeCount > 9 ? styles.badgeWide : null,
            badgeStyle,
          ]}
        >
          <Text style={styles.badgeText}>{label}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 44,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    position: 'absolute',
    width: 44,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.greenSurface,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: 2,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 3,
    backgroundColor: colors.rejected,
    borderWidth: 1.5,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeWide: { minWidth: 20 },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
});
