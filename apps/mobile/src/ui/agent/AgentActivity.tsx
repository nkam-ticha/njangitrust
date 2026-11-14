// Typing dots and the AgentActivityLine (spec 1.5; DESIGN_SYSTEM.md 5.24, 7.3).
// Dots step in opacity 0.4 → 1, 300 ms apart (900 ms loop), static under reduce motion.
// The activity line names the tool being run ("Je vérifie la caisse…"); each new tool replaces it.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { duration, radius, space, useReduceMotion, useTheme } from '@/theme';
import { Txt } from '../primitives/Txt';

export function TypingDots() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const reduce = useReduceMotion();
  const values = useState(() => [0, 1, 2].map(() => new Animated.Value(0.4)))[0];
  useEffect(() => {
    if (reduce) return;
    const step = (v: Animated.Value) =>
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: duration.typingStep, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.4, duration: duration.typingStep, useNativeDriver: true }),
      ]);
    const loop = Animated.loop(Animated.stagger(duration.typingStep, values.map(step)));
    loop.start();
    return () => loop.stop();
  }, [reduce, values]);
  return (
    <View style={styles.dots} accessible accessibilityLabel={t('agent.typing')}>
      {values.map((v, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, { backgroundColor: colors.outline, opacity: reduce ? 1 : v }]}
        />
      ))}
    </View>
  );
}

/** `tool`: the agent tool name from the activity event; unknown tools read "Je vérifie…". */
export function AgentActivityLine({ tool }: { tool: string | null }) {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const key =
    tool && i18n.exists(`agent.activity.${tool}`)
      ? `agent.activity.${tool}`
      : 'agent.activity.default';
  const text = t(key as 'agent.activity.default');
  return (
    <View
      style={styles.activity}
      accessibilityLiveRegion="polite"
      accessible
      accessibilityLabel={t('agent.a11y.activity', { text })}
    >
      <ActivityIndicator size="small" color={colors.iconSecondary} />
      <Txt variant="secondary" color="textSecondary">
        {text}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: space.s4,
    paddingLeft: space.s4 + 24,
    paddingVertical: space.s2,
  },
  dot: { width: 6, height: 6, borderRadius: radius.full },
  activity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    paddingLeft: space.s4 + 24,
    paddingRight: space.s4,
  },
});
