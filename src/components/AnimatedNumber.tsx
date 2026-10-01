/**
 * A number that counts to its new value instead of jumping.
 *
 * On the live tally, figures that snap instantly between polls look like a
 * page reload; figures that roll look like votes arriving. Plain
 * requestAnimationFrame + setState rather than Reanimated: text content can
 * only change on the JS thread anyway, and 600ms of ease-out at even 20fps
 * reads perfectly.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

const DURATION_MS = 600;

const easeOut = (t: number) => 1 - (1 - t) ** 3;

export function AnimatedNumber({
  value,
  style,
  format = (n) => n.toLocaleString('en-KE'),
}: {
  value: number;
  style?: StyleProp<TextStyle>;
  format?: (n: number) => string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;

    const start = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / DURATION_MS);
      const current = Math.round(from + (value - from) * easeOut(t));
      setDisplay(current);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = value;
      }
    };
    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      fromRef.current = value;
    };
  }, [value]);

  return <Text style={style}>{format(display)}</Text>;
}
