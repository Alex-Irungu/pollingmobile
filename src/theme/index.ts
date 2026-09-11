/**
 * Sentinel design tokens.
 *
 * Colours are sampled from the supplied Sentinel logo, not invented: the deep
 * forest green and muted gold are the brand, and everything else is built to
 * sit alongside them.
 *
 * Three constraints shaped these choices, all specific to the job:
 *
 * 1. The app is used outdoors at dawn and in badly-lit halls at midnight, so
 *    text/background pairs here target WCAG AA at minimum.
 * 2. It is used one-handed, in a hurry, by tired people. Tap targets are >=48dp
 *    and type does not go below 13pt.
 * 3. It runs on cheap Android phones, so there are no blurs, shadows stay
 *    cheap, and nothing animates on a timer.
 */

export const colors = {
  /** Brand green, sampled from the logo. */
  green: '#014131',
  greenDark: '#002A1F',
  greenLight: '#0A5A45',
  greenSurface: '#E8F0ED',

  /** Brand gold, sampled from the logo's iris and ballot slip. */
  gold: '#BD9035',
  goldLight: '#D9B05C',
  goldSurface: '#FBF4E6',

  /** Neutrals. Slightly warm, so the greens do not read as clinical. */
  ink: '#12201C',
  inkMuted: '#5A6B65',
  inkFaint: '#8A9994',
  line: '#DFE5E3',
  lineStrong: '#C7D1CE',
  surface: '#FFFFFF',
  surfaceAlt: '#F6F8F7',
  canvas: '#F1F4F3',

  /**
   * Status colours. Deliberately not the usual traffic-light set: "pending" is
   * the normal, expected state for a fresh submission and must not look like a
   * warning, or agents will think something went wrong.
   */
  pending: '#B0803A',
  pendingSurface: '#FDF3E3',
  verified: '#1B7A53',
  verifiedSurface: '#E6F3ED',
  flagged: '#C2610C',
  flaggedSurface: '#FDF0E2',
  rejected: '#B3261E',
  rejectedSurface: '#FBE9E7',
  info: '#1F5C8B',
  infoSurface: '#E8F1F8',

  /** Chat bubbles. */
  bubbleOwn: '#DCF3E7',
  bubbleOther: '#FFFFFF',

  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0, 20, 14, 0.55)',
} as const;

/** 4pt spacing scale. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

import type { TextStyle } from 'react-native';

export const typography = {
  /** Screen titles. */
  display: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const },
  label: { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.2 },
  caption: { fontSize: 13, fontWeight: '400' as const },
  micro: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4 },
  /**
   * Vote figures. Tabular so digits line up column-wise when checking a
   * transcription against the paper form, which is how errors get spotted.
   *
   * Typed as TextStyle rather than inferred: `as const` would make
   * `fontVariant` a readonly tuple, which React Native's mutable
   * `FontVariant[]` will not accept when this is spread into a StyleSheet.
   */
  numeric: {
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  } satisfies TextStyle as TextStyle,
} as const;

/**
 * Shadows. Kept shallow: on low-end Android, large elevation values cost real
 * frames, and this app must stay responsive above all else.
 */
export const shadow = {
  sm: {
    shadowColor: '#00140E',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: '#00140E',
    shadowOpacity: 0.09,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  lg: {
    shadowColor: '#00140E',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
} as const;

/** Minimum touch target. Below this, tired thumbs miss. */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TOUCH = 48;

/**
 * Animation timings. Short, because these fire on every interaction and
 * anything slower starts to feel like lag rather than polish.
 */
export const motion = {
  fast: 140,
  base: 220,
  slow: 320,
} as const;
