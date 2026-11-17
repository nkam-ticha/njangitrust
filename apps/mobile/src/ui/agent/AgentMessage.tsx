// Agent reply in the Njangi tab (DESIGN_SYSTEM.md 5.24, DD-13): no bubble, plain text across the
// column, a 16 dp RingMark at the start of each turn, a static caret while streaming.
// Renders bold (**…**) and simple "- " bullet lines; nothing else.
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { duration, easing, space, useReduceMotion, useTheme } from '@/theme';
import { RingMark } from '../brand/RingMark';
import { AgentOrb } from './AgentOrb';
import { Txt } from '../primitives/Txt';

interface AgentMessageProps {
  text: string;
  /** First message of an agent turn: shows the RingMark. */
  startOfTurn?: boolean;
  streaming?: boolean;
  /** While the reply is written, a small orb takes the place of the ring and speaks with it. */
  speaking?: boolean;
}

function inline(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <Txt key={i} variant="bodyStrong">
        {part.slice(2, -2)}
      </Txt>
    ) : (
      part
    ),
  );
}

export function AgentMessage({ text, startOfTurn = true, streaming, speaking }: AgentMessageProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const reduce = useReduceMotion();
  // The reply rises into place and fades in, instead of appearing all at once.
  const entrance = useState(() => new Animated.Value(reduce ? 1 : 0))[0];
  useEffect(() => {
    if (reduce) return;
    Animated.timing(entrance, {
      toValue: 1,
      duration: duration.sheetIn,
      easing: easing.out,
      useNativeDriver: true,
    }).start();
  }, [entrance, reduce]);
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  return (
    <Animated.View
      style={[
        styles.row,
        {
          opacity: entrance,
          transform: [
            { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          ],
        },
      ]}
      accessible
      accessibilityLabel={t('agent.a11y.agentMessage', { text: text.replace(/\*\*/g, '') })}
      accessibilityState={{ busy: !!streaming }}
    >
      <View style={styles.mark}>
        {startOfTurn ? (
          speaking ? (
            <AgentOrb size={16} mode="speaking" />
          ) : (
            <RingMark size={16} color={colors.iconActive} />
          )
        ) : null}
      </View>
      <View style={styles.body}>
        {lines.map((line, i) => {
          const bullet = /^\s*[-•]\s+/.test(line);
          const last = i === lines.length - 1;
          return (
            <View key={i} style={bullet ? styles.bullet : null}>
              {bullet ? <Txt>•</Txt> : null}
              <Txt style={styles.flex} selectable>
                {inline(bullet ? line.replace(/^\s*[-•]\s+/, '') : line)}
                {streaming && last ? <Txt color="textSecondary"> ▍</Txt> : null}
              </Txt>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.s2, paddingHorizontal: space.s4 },
  mark: { width: 16, paddingTop: 3 },
  body: { flex: 1, gap: 6 },
  bullet: { flexDirection: 'row', gap: space.s2 },
  flex: { flex: 1 },
});
