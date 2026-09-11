/**
 * Primary action button.
 *
 * Press feedback is a scale-down on the pressed state driven by Reanimated on
 * the UI thread, so it stays responsive even while the JS thread is busy
 * compressing a photo or writing to the database. A button that stops
 * responding mid-upload reads as a frozen app.
 *
 * Haptics fire on press rather than on completion: the agent gets confirmation
 * that the tap registered, which matters when the following work takes a
 * second or two.
 */

import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { MIN_TOUCH, colors, motion, radius, spacing, typography } from '../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  /** Rendered to the left of the label. */
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  fullWidth = true,
  style,
}: ButtonProps) {
  const pressed = useSharedValue(0);
  const inert = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.02 }],
    opacity: 1 - pressed.value * 0.08,
  }));

  const palette = PALETTE[variant];

  return (
    <Animated.View style={[fullWidth && styles.fullWidth, animatedStyle, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: inert, busy: loading }}
        disabled={inert}
        onPressIn={() => {
          pressed.value = withTiming(1, { duration: motion.fast });
        }}
        onPressOut={() => {
          pressed.value = withTiming(0, { duration: motion.fast });
        }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
            () => undefined,
          );
          onPress();
        }}
        style={[
          styles.base,
          { backgroundColor: palette.background, borderColor: palette.border },
          variant === 'ghost' && styles.ghost,
          inert && styles.inert,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={palette.text} size="small" />
        ) : (
          <View style={styles.content}>
            {icon ? <View style={styles.icon}>{icon}</View> : null}
            <Text style={[styles.label, { color: palette.text }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const PALETTE: Record<Variant, { background: string; text: string; border: string }> = {
  primary: { background: colors.green, text: colors.white, border: colors.green },
  secondary: {
    background: colors.surface,
    text: colors.green,
    border: colors.lineStrong,
  },
  ghost: { background: 'transparent', text: colors.green, border: 'transparent' },
  danger: { background: colors.rejected, text: colors.white, border: colors.rejected },
};

const styles = StyleSheet.create({
  fullWidth: { width: '100%' },
  base: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  ghost: { borderWidth: 0 },
  inert: { opacity: 0.45 },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  icon: { marginRight: spacing.sm },
  label: { ...typography.bodyStrong },
});
