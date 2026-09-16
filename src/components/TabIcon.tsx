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
import { ColorValue, StyleSheet, View } from 'react-native';
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
  showBadge?: boolean;
}

export function TabIcon({ name, focusedName, color, size, focused, showBadge }: TabIconProps) {
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

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.pill, pillStyle]} />
      <Animated.View style={iconStyle}>
        <Ionicons name={focused ? focusedName : name} size={size} color={color} />
      </Animated.View>
      {showBadge ? <View style={styles.badge} /> : null}
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
    top: -1,
    right: 6,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.gold,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
});
