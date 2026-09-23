/**
 * Last line of defence against a crash.
 *
 * This exists because of a behaviour difference that matters enormously in the
 * field: in a development build, an uncaught JS error draws a red box and the
 * app keeps running. In a release build, React Native's default fatal handler
 * tears the whole process down -- from the agent's point of view, "the app just
 * closed". If that happens mid-submission, the vote figures they have already
 * typed are gone, and they are standing in a polling station at midnight with
 * no idea what went wrong or what to tell anyone.
 *
 * So nothing here tries to be clever about recovery. It keeps the process
 * alive, says plainly that something broke, and shows the error text so the
 * agent can read it down the phone to whoever is on support -- which is also
 * the only crash report this app currently produces.
 *
 * Two classes of error are handled, because a React boundary alone is not
 * enough:
 *
 *   1. Errors thrown during render/lifecycle -> componentDidCatch.
 *   2. Errors thrown outside React's call stack (a rejected promise in a
 *      native-module callback, a setTimeout body) -> the global handler
 *      installed below, which RN would otherwise treat as fatal.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

/**
 * RN's global error hook. Not in the public types, but it is the documented
 * mechanism and is what the redbox itself is built on.
 */
interface ErrorUtilsShape {
  getGlobalHandler: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
}

function getErrorUtils(): ErrorUtilsShape | undefined {
  return (globalThis as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;
}

/**
 * Set while a boundary is mounted, so the global handler (which runs outside
 * React) has something to hand the error to.
 */
let reportToBoundary: ((error: Error) => void) | null = null;

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(typeof value === 'string' ? value : JSON.stringify(value));
}

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  private previousGlobalHandler:
    | ((error: unknown, isFatal?: boolean) => void)
    | undefined;

  static getDerivedStateFromError(error: unknown): State {
    return { error: toError(error) };
  }

  componentDidMount(): void {
    reportToBoundary = (error) => this.setState({ error });

    const errorUtils = getErrorUtils();
    if (!errorUtils) return;

    this.previousGlobalHandler = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      // Only intercept what would otherwise kill the process. Non-fatal
      // errors are left to the default handler so development redboxes and
      // console warnings keep behaving normally.
      if (isFatal) {
        reportToBoundary?.(toError(error));
        return;
      }
      this.previousGlobalHandler?.(error, isFatal);
    });
  }

  componentWillUnmount(): void {
    reportToBoundary = null;
    const errorUtils = getErrorUtils();
    if (errorUtils && this.previousGlobalHandler) {
      errorUtils.setGlobalHandler(this.previousGlobalHandler);
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // The console is the only sink available in a release build without a
    // crash reporter wired up; it is still visible over `adb logcat`.
    console.error('[sentinel] unhandled error', error, info.componentStack);
  }

  private retry = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.root}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="warning-outline" size={26} color={colors.rejected} />
          </View>

          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            The app hit an unexpected problem. Nothing you have already
            submitted is affected. Tap Try again to carry on -- if it keeps
            happening, read the message below to whoever is on support.
          </Text>

          <ScrollView style={styles.detailWrap} contentContainerStyle={styles.detail}>
            <Text style={styles.detailText}>{error.message || String(error)}</Text>
          </ScrollView>

          <Pressable
            onPress={this.retry}
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.xl,
    gap: spacing.md,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.rejectedSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.title, color: colors.ink },
  body: { ...typography.body, color: colors.inkMuted, lineHeight: 21 },
  detailWrap: {
    maxHeight: 140,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  detail: { padding: spacing.md },
  detailText: { ...typography.caption, color: colors.inkMuted },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  buttonText: { ...typography.bodyStrong, color: colors.white },
});
