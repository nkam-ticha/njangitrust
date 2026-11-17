// A ring of coloured light that travels around the edge of the screen while the agent is answering,
// like the glow Siri draws around the display. Token colours only; it never takes a touch and it
// is not drawn at all under "reduce motion".
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useReduceMotion, useTheme } from '@/theme';

const R = 170;

function Light({ id, color, opacity }: { id: string; color: string; opacity: number }) {
  return (
    <Svg width={R * 2} height={R * 2} viewBox={`0 0 ${R * 2} ${R * 2}`}>
      <Defs>
        <RadialGradient id={id} cx={R} cy={R} r={R} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.5" stopColor={color} stopOpacity={opacity * 0.4} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={R} cy={R} r={R} fill={`url(#${id})`} />
    </Svg>
  );
}

export function AgentGlow({ active }: { active: boolean }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const { width, height } = useWindowDimensions();
  const progress = useState(() => new Animated.Value(0))[0];
  const fade = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    if (reduce) return;
    if (active) {
      progress.setValue(0);
      const loop = Animated.loop(
        Animated.timing(progress, {
          toValue: 1,
          duration: 6500,
          easing: (t: number) => t,
          useNativeDriver: true,
        }),
      );
      Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start();
      loop.start();
      return () => loop.stop();
    }
    Animated.timing(fade, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    return undefined;
  }, [active, reduce, progress, fade]);

  if (reduce) return null;

  // The four corners in the order a light visits them; each light starts at a different one.
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const lights = [
    { color: colors.iconActive, opacity: 0.55 },
    { color: colors.accentRaffia, opacity: 0.5 },
    { color: colors.statusPaid, opacity: 0.45 },
    { color: colors.iconActive, opacity: 0.45 },
  ];
  const along = (phase: number, axis: 'x' | 'y') =>
    progress.interpolate({
      inputRange: [0, 0.25, 0.5, 0.75, 1],
      outputRange: [0, 1, 2, 3, 4].map((i) => corners[(i + phase) % 4]![axis] - R),
    });

  return (
    <Animated.View pointerEvents="none" style={[styles.fill, { opacity: fade }]}>
      {lights.map((light, phase) => (
        <Animated.View
          key={phase}
          style={[
            styles.light,
            { transform: [{ translateX: along(phase, 'x') }, { translateY: along(phase, 'y') }] },
          ]}
        >
          <Light id={`edge${phase}`} color={light.color} opacity={light.opacity} />
        </Animated.View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' },
  light: { position: 'absolute', left: 0, top: 0, width: R * 2, height: R * 2 },
});
