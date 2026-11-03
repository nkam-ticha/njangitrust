// The two signature motions (spec 1.2; DESIGN_SYSTEM.md 6.7), React Native Animated only (D4).
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, View } from 'react-native';
import { Circle } from 'react-native-svg';
import { duration, easing } from '@/theme';

/**
 * 1. A contribution lands: one 600 ms pulse over the dot. A disc scales 1 → 1.4 (200 ms, out cubic)
 * → 1 (400 ms, in-out cubic) while a halo ring scales 1 → 2.6 and fades 0.5 → 0 (out quad).
 * Transform and opacity only, on the native driver.
 */
export function PulseDot({ x, y, r, color, delay, onDone }: { x: number; y: number; r: number; color: string; delay: number; onDone: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const halo = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.4, duration: duration.pulse / 3, easing: easing.out, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: (duration.pulse * 2) / 3, easing: easing.inOut, useNativeDriver: true }),
        ]),
        Animated.timing(halo, { toValue: 1, duration: duration.pulse, easing: easing.outQuad, useNativeDriver: true }),
      ]),
    ]);
    anim.start(({ finished }) => finished && onDone());
    return () => anim.stop();
  }, [delay, halo, onDone, scale]);

  const box = { position: 'absolute' as const, left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: r };
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[box, { borderWidth: 2, borderColor: color, opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }] }]}
      />
      <Animated.View pointerEvents="none" style={[box, { backgroundColor: color, transform: [{ scale }] }]} />
    </>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * 2. The round is fully paid: a raffia stroke runs once round the track from 12 o'clock,
 * clockwise, in 1 200 ms (in-out cubic). strokeDashoffset is an SVG prop, so this runs on the
 * JS driver: one property for 1.2 s, cheap even on entry-level phones.
 */
export function SweepArc({ c, R, width, color, delay, onDone }: { c: number; R: number; width: number; color: string; delay: number; onDone: () => void }) {
  const circumference = 2 * Math.PI * R;
  const offset = useRef(new Animated.Value(circumference)).current;
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.timing(offset, { toValue: 0, duration: duration.sweep, easing: easing.inOut, useNativeDriver: false }),
    ]);
    anim.start(({ finished }) => finished && onDone());
    return () => anim.stop();
  }, [delay, offset, onDone]);
  return (
    <AnimatedCircle
      cx={c}
      cy={c}
      r={R}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeDasharray={`${circumference}`}
      strokeDashoffset={offset}
      transform={`rotate(-90 ${c} ${c})`}
    />
  );
}

/** Keeps the overlay layer aligned with the SVG box. */
export function OverlayLayer({ size, children }: { size: number; children: ReactNode }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }}>
      {children}
    </View>
  );
}
