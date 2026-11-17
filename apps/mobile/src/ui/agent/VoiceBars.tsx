// A few rounded bars that rise and fall like a voice (the waveform of a recording and of the agent
// speaking). Each bar moves on its own rhythm; they hold still when `active` is false or under
// "reduce motion".
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { easing, radius, useReduceMotion } from '@/theme';

interface VoiceBarsProps {
  active: boolean;
  color: string;
  bars?: number;
  /** Height of the tallest bar. */
  height?: number;
}

const RHYTHM = [380, 260, 450, 300, 410, 330, 270];

export function VoiceBars({ active, color, bars = 5, height = 24 }: VoiceBarsProps) {
  const reduce = useReduceMotion();
  const values = useState(() => Array.from({ length: bars }, () => new Animated.Value(0.3)))[0];

  useEffect(() => {
    if (reduce || !active) {
      values.forEach((v) => v.setValue(0.3));
      return;
    }
    const loops = values.map((value, i) => {
      const ms = RHYTHM[i % RHYTHM.length]!;
      return Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration: ms,
            easing: easing.inOut,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.25,
            duration: ms * 0.9,
            easing: easing.inOut,
            useNativeDriver: true,
          }),
        ]),
      );
    });
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [active, reduce, values]);

  const width = Math.max(3, Math.round(height / 7));
  return (
    <View
      style={[styles.row, { height, gap: width }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {values.map((value, i) => (
        <Animated.View
          key={i}
          style={{
            width,
            height,
            borderRadius: radius.full,
            backgroundColor: color,
            transform: [{ scaleY: value }],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
