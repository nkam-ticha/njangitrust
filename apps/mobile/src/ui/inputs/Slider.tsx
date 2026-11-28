// Slider for an amount, built in-house with PanResponder (D4; DESIGN_SYSTEM.md 5.2). No reanimated,
// no gesture handler. Always paired with an AmountInput, so it is never the only way to set the value.
// Touch: tap or drag the track. Keyboard (web, hardware keyboards): arrows move one step, Page Up and
// Page Down ten, Home and End go to the limits. Screen readers: role adjustable, increment and
// decrement actions, the value spoken as words. The limits come from the caller (the server's).
import { useEffect, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { radius, useTheme } from '@/theme';
import { amountLabel } from '../money/AmountText';
import { isKeyboardModality } from '../primitives/focusVisible';
import { useLang } from '../primitives/useLang';
import { clamp, nudge, ratioOf, valueAt } from './sliderMath';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  /** 1 000 FCFA by default, 500 below 5 000 (DESIGN_SYSTEM.md 5.2). */
  step?: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
  disabled?: boolean;
}

const THUMB = 24;
const PAGE_STEPS = 10;

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  accessibilityLabel,
  disabled,
}: SliderProps) {
  const { colors } = useTheme();
  const lang = useLang();
  const [width, setWidth] = useState(0);
  const [focused, setFocused] = useState(false);
  const shown = clamp(value, min, max);
  const ratio = ratioOf(shown, min, max);

  // The thumb's centre travels between half a thumb from each end, so it never leaves the track.
  const travel = Math.max(0, width - THUMB);
  const latest = useRef({ travel, min, max, step, onChange });
  useEffect(() => {
    latest.current = { travel, min, max, step, onChange };
  });
  const startRatio = useRef(0);
  const atRatio = (r: number) => {
    const { min: lo, max: hi, step: s, onChange: set } = latest.current;
    set(valueAt(r, lo, hi, s));
  };
  // The PanResponder is created once; its callbacks read the refs on gestures, never during render.
  /* eslint-disable react-hooks/refs */
  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { travel: span } = latest.current;
        if (!span) return;
        const r = clamp((e.nativeEvent.locationX - THUMB / 2) / span, 0, 1);
        startRatio.current = r;
        atRatio(r);
      },
      onPanResponderMove: (_, g) => {
        const { travel: span } = latest.current;
        if (!span) return;
        atRatio(clamp(startRatio.current + g.dx / span, 0, 1));
      },
    }),
  );
  /* eslint-enable react-hooks/refs */

  const move = (direction: 1 | -1, times = 1) =>
    onChange(nudge(shown, direction, min, max, { step, times }));

  const onAction = (e: AccessibilityActionEvent) => {
    if (disabled) return;
    if (e.nativeEvent.actionName === 'increment') move(1);
    if (e.nativeEvent.actionName === 'decrement') move(-1);
  };

  const onKeyDown = (e: NativeSyntheticEvent<{ key: string }>) => {
    if (disabled) return;
    const keys: Record<string, () => void> = {
      ArrowRight: () => move(1),
      ArrowUp: () => move(1),
      ArrowLeft: () => move(-1),
      ArrowDown: () => move(-1),
      PageUp: () => move(1, PAGE_STEPS),
      PageDown: () => move(-1, PAGE_STEPS),
      Home: () => onChange(min),
      End: () => onChange(max),
    };
    const act = keys[e.nativeEvent.key];
    if (!act) return;
    act();
    (e as { preventDefault?: () => void }).preventDefault?.();
  };

  return (
    <View
      accessible
      focusable={!disabled}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: shown, text: amountLabel(shown, lang) }}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={shown}
      aria-valuetext={amountLabel(shown, lang)}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      accessibilityState={{ disabled: !!disabled }}
      onAccessibilityAction={onAction}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.hit, disabled && styles.disabled]}
      {...(disabled ? {} : pan.panHandlers)}
    >
      {focused && isKeyboardModality() ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.ring, { borderColor: colors.focusRing }]}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={[styles.track, { backgroundColor: colors.outline, marginHorizontal: THUMB / 2 }]}
      >
        <View
          style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: colors.primary }]}
        />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.thumb,
          {
            left: ratio * travel,
            backgroundColor: colors.primary,
            borderColor: colors.canvas,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    height: 48,
    justifyContent: 'center',
    cursor: 'pointer',
  },
  ring: { borderWidth: 2, borderRadius: radius.group },
  disabled: { opacity: 0.5 },
  track: { height: 4, borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: 4 },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: radius.full,
    borderWidth: 2,
    top: 10,
  },
});
