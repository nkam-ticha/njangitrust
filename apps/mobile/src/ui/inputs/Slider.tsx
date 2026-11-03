// Slider for the loan amount, built in-house with PanResponder (D4; DESIGN_SYSTEM.md 5.2).
// Always paired with an AmountInput, so it is never the only way to set the value.
// Screen readers: role adjustable, increment / decrement actions, value as words.
import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import { radius, useTheme } from '@/theme';
import { amountLabel } from '../money/AmountText';
import { useLang } from '../primitives/useLang';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  /** 1 000 FCFA by default, 500 below 5 000 (DESIGN_SYSTEM.md 5.2). */
  step?: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
}

export function Slider({ value, min, max, step, onChange, accessibilityLabel }: SliderProps) {
  const { colors } = useTheme();
  const lang = useLang();
  const [width, setWidth] = useState(0);
  const stepFor = (v: number) => step ?? (v < 5000 ? 500 : 1000);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const snap = (v: number) => clamp(Math.round(v / stepFor(v)) * stepFor(v));
  const ratio = max > min ? (clamp(value) - min) / (max - min) : 0;

  const startRatio = useRef(0);
  const latest = useRef({ width, min, max, onChange, snap });
  latest.current = { width, min, max, onChange, snap };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { width: w, min: lo, max: hi, onChange: set, snap: snapTo } = latest.current;
        if (!w) return;
        const r = Math.min(1, Math.max(0, e.nativeEvent.locationX / w));
        startRatio.current = r;
        set(snapTo(lo + r * (hi - lo)));
      },
      onPanResponderMove: (_, g) => {
        const { width: w, min: lo, max: hi, onChange: set, snap: snapTo } = latest.current;
        if (!w) return;
        const r = Math.min(1, Math.max(0, startRatio.current + g.dx / w));
        set(snapTo(lo + r * (hi - lo)));
      },
    }),
  ).current;

  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') onChange(snap(value + stepFor(value)));
    if (e.nativeEvent.actionName === 'decrement') onChange(snap(value - stepFor(value)));
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value, text: amountLabel(value, lang) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAction}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={styles.hit}
      {...pan.panHandlers}
    >
      <View pointerEvents="none" style={[styles.track, { backgroundColor: colors.outline }]}>
        <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: colors.primary }]} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.thumb, { left: Math.max(0, ratio * width - 12), backgroundColor: colors.primary, borderColor: colors.canvas }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 48, justifyContent: 'center', cursor: 'pointer' },
  track: { height: 4, borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: 4 },
  thumb: { position: 'absolute', width: 24, height: 24, borderRadius: radius.full, borderWidth: 2, top: 12 },
});
