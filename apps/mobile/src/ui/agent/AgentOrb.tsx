// The agent's orb: a glass-like sphere of slowly swirling light, in the colours of the design tokens
// only (indigo, raffia, paid green). It breathes when idle, swirls faster while the agent is
// thinking and pulses like a voice while it answers (the way Siri does). Built on Animated and
// react-native-svg (D4); under "reduce motion" it stays still.
import { useEffect, useId, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { easing, useReduceMotion, useTheme } from '@/theme';
import { withAlpha } from '@/theme/palette';

/** A constant speed: the swirl and the travelling light never ease. */
const linear = (t: number) => t;

export type OrbMode = 'idle' | 'thinking' | 'speaking';

interface AgentOrbProps {
  size?: number;
  mode?: OrbMode;
}

/** A soft round blob of one colour that fades to nothing at its edge. */
function Blob({
  id,
  size,
  cx,
  cy,
  r,
  color,
  opacity,
}: {
  id: string;
  size: number;
  cx: number;
  cy: number;
  r: number;
  color: string;
  opacity: number;
}) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <RadialGradient id={id} cx={cx} cy={cy} r={r} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.55" stopColor={color} stopOpacity={opacity * 0.45} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={cx} cy={cy} r={r} fill={`url(#${id})`} />
    </Svg>
  );
}

const SWIRL_MS = { idle: 14000, thinking: 2600, speaking: 5200 } as const;

export function AgentOrb({ size = 56, mode = 'idle' }: AgentOrbProps) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const spin = useState(() => new Animated.Value(0))[0];
  const spinBack = useState(() => new Animated.Value(0))[0];
  const breathe = useState(() => new Animated.Value(1))[0];
  const glow = useState(() => new Animated.Value(0.6))[0];

  useEffect(() => {
    if (reduce) return;
    const swirl = SWIRL_MS[mode];
    spin.setValue(0);
    spinBack.setValue(0);
    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: swirl,
        easing: linear,
        useNativeDriver: true,
      }),
    );
    const backLoop = Animated.loop(
      Animated.timing(spinBack, {
        toValue: 1,
        duration: swirl * 1.7,
        easing: linear,
        useNativeDriver: true,
      }),
    );
    // The sphere breathes calmly when idle, quickly when thinking, and jumps like a voice when it
    // speaks: uneven steps, so it never looks like a metronome.
    const steps =
      mode === 'speaking'
        ? [1.0, 1.16, 0.97, 1.11, 1.02, 1.18, 0.98, 1.08]
        : mode === 'thinking'
          ? [0.94, 1.06]
          : [1, 1.045];
    const stepMs = mode === 'speaking' ? 190 : mode === 'thinking' ? 800 : 2300;
    const breatheLoop = Animated.loop(
      Animated.sequence(
        steps.map((toValue) =>
          Animated.timing(breathe, {
            toValue,
            duration: stepMs,
            easing: easing.inOut,
            useNativeDriver: true,
          }),
        ),
      ),
    );
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: mode === 'idle' ? 0.75 : 1,
          duration: mode === 'idle' ? 2300 : 700,
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: mode === 'idle' ? 0.5 : 0.65,
          duration: mode === 'idle' ? 2300 : 700,
          useNativeDriver: true,
        }),
      ]),
    );
    spinLoop.start();
    backLoop.start();
    breatheLoop.start();
    glowLoop.start();
    return () => {
      spinLoop.stop();
      backLoop.stop();
      breatheLoop.stop();
      glowLoop.stop();
    };
  }, [mode, reduce, spin, spinBack, breathe, glow]);

  const turn = (value: Animated.Value, reverse: boolean) => ({
    transform: [
      {
        rotate: value.interpolate({
          inputRange: [0, 1],
          outputRange: reverse ? ['360deg', '0deg'] : ['0deg', '360deg'],
        }),
      },
    ],
  });
  const half = size / 2;
  const halo = size * 1.9;

  return (
    <View
      style={{ width: size, height: size }}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* The halo around the sphere. */}
      <Animated.View
        style={[
          styles.fill,
          {
            width: halo,
            height: halo,
            left: (size - halo) / 2,
            top: (size - halo) / 2,
            opacity: glow,
            transform: [{ scale: breathe }],
          },
        ]}
      >
        <Blob
          id={`${uid}h`}
          size={halo}
          cx={halo / 2}
          cy={halo / 2}
          r={halo / 2}
          color={colors.iconActive}
          opacity={0.5}
        />
      </Animated.View>

      <Animated.View
        style={[styles.sphere, { width: size, height: size, transform: [{ scale: breathe }] }]}
      >
        <View
          style={[
            styles.clip,
            {
              borderRadius: half,
              backgroundColor: colors.primary,
              borderColor: withAlpha(colors.textOnPrimary, 0.28),
            },
          ]}
        >
          <Animated.View style={[styles.fill, { width: size, height: size }, turn(spin, false)]}>
            <Blob
              id={`${uid}a`}
              size={size}
              cx={size * 0.72}
              cy={size * 0.42}
              r={size * 0.46}
              color={colors.accentRaffia}
              opacity={0.95}
            />
          </Animated.View>
          <Animated.View style={[styles.fill, { width: size, height: size }, turn(spinBack, true)]}>
            <Blob
              id={`${uid}b`}
              size={size}
              cx={size * 0.28}
              cy={size * 0.62}
              r={size * 0.5}
              color={colors.statusPaid}
              opacity={0.85}
            />
          </Animated.View>
          <Animated.View style={[styles.fill, { width: size, height: size }, turn(spin, false)]}>
            <Blob
              id={`${uid}c`}
              size={size}
              cx={size * 0.5}
              cy={size * 0.18}
              r={size * 0.4}
              color={colors.textOnPrimary}
              opacity={0.7}
            />
          </Animated.View>
          {/* The glass highlight. */}
          <View style={styles.fill}>
            <Blob
              id={`${uid}d`}
              size={size}
              cx={size * 0.34}
              cy={size * 0.28}
              r={size * 0.3}
              color={colors.textOnPrimary}
              opacity={0.55}
            />
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute' },
  sphere: { position: 'absolute', left: 0, top: 0 },
  clip: { flex: 1, overflow: 'hidden', borderWidth: 1 },
});
