/**
 * Sign in.
 *
 * There is no "create account" and no "sign up" link, by design: agents are
 * registered by the command centre, which is what ties a person to a specific
 * polling station. Self-registration would let anyone with the app claim to be
 * an agent, so the only route in is an account an admin created.
 *
 * There is also no password reset here. An agent who cannot get in at 5am needs
 * a human, not an email link they may not be able to open -- so the screen
 * tells them to call the command centre.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '../src/api/client';
import { getRememberedEmail } from '../src/api/tokens';
import { Banner } from '../src/components/ui';
import { useAuth } from '../src/store/auth';
import {
  HIT_SLOP,
  MIN_TOUCH,
  colors,
  radius,
  shadow,
  spacing,
  typography,
} from '../src/theme';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    // Pre-fill the last email used on this device. Saves an agent typing it on
    // a phone keyboard in the dark; it is not a credential.
    getRememberedEmail().then((remembered) => {
      if (remembered) setEmail(remembered);
    });
  }, []);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  async function handleSignIn() {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
      // No navigation here: the gate in _layout reacts to the status change.
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 401
            ? 'Wrong email or password. Check and try again.'
            : err.message
          : 'Could not sign in. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.greenDark, colors.green, colors.greenLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInDown.duration(420)} style={styles.header}>
            <View style={styles.logoMark}>
              <Ionicons name="shield-checkmark" size={34} color={colors.gold} />
            </View>
            <Text style={styles.wordmark}>Sentinel</Text>
            <Text style={styles.tagline}>Field Agent</Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(120).duration(420)}
            style={styles.card}
          >
            <Text style={styles.cardTitle}>Sign in</Text>
            <Text style={styles.cardSubtitle}>
              Use the account the command centre created for you.
            </Text>

            {error ? (
              <View style={styles.errorWrap}>
                <Banner tone="error" message={error} />
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={colors.inkFaint}
                  style={styles.inputIcon}
                />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.inkFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  style={styles.input}
                  editable={!busy}
                  accessibilityLabel="Email address"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={colors.inkFaint}
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={passwordRef}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Your password"
                  placeholderTextColor={colors.inkFaint}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password"
                  returnKeyType="go"
                  onSubmitEditing={handleSignIn}
                  style={styles.input}
                  editable={!busy}
                  accessibilityLabel="Password"
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={HIT_SLOP}
                  style={styles.reveal}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.inkMuted}
                  />
                </Pressable>
              </View>
            </View>

            <Pressable
              onPress={handleSignIn}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.submit,
                !canSubmit && styles.submitDisabled,
                pressed && canSubmit && styles.submitPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              accessibilityState={{ disabled: !canSubmit, busy }}
            >
              {busy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Text style={styles.submitText}>Sign in</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.white} />
                </>
              )}
            </Pressable>

            <View style={styles.help}>
              <Ionicons name="call-outline" size={15} color={colors.inkMuted} />
              <Text style={styles.helpText}>
                Trouble signing in? Call the command centre -- they can reset your
                access.
              </Text>
            </View>
          </Animated.View>

          <Animated.Text entering={FadeIn.delay(400)} style={styles.disclaimer}>
            Sentinel is an internal campaign tool. It is not an IEBC system and is
            not endorsed by the IEBC.
          </Animated.Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.green },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  header: { alignItems: 'center', marginBottom: spacing.xxl },
  logoMark: {
    width: 68,
    height: 68,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(189,144,53,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  wordmark: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: -0.6,
  },
  tagline: {
    ...typography.label,
    color: colors.goldLight,
    marginTop: 2,
    letterSpacing: 1.6,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.lg,
  },
  cardTitle: { ...typography.title, color: colors.ink },
  cardSubtitle: {
    ...typography.caption,
    color: colors.inkMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    lineHeight: 19,
  },
  errorWrap: { marginBottom: spacing.base },
  field: { marginBottom: spacing.base },
  label: { ...typography.label, color: colors.ink, marginBottom: spacing.sm },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md,
  },
  inputIcon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.ink,
    paddingVertical: spacing.md,
  },
  reveal: { padding: spacing.xs },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.green,
    minHeight: MIN_TOUCH + 4,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  submitDisabled: { opacity: 0.4 },
  submitPressed: { backgroundColor: colors.greenDark },
  submitText: { ...typography.bodyStrong, color: colors.white, fontSize: 16 },
  help: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  helpText: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 18 },
  disclaimer: {
    ...typography.caption,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginTop: spacing.xl,
    lineHeight: 17,
  },
});
