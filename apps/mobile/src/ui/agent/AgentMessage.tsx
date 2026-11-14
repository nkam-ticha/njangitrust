// Agent reply in the Njangi tab (DESIGN_SYSTEM.md 5.24, DD-13): no bubble, plain text across the
// column, a 16 dp RingMark at the start of each turn, a static caret while streaming.
// Renders bold (**…**) and simple "- " bullet lines; nothing else.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { space, useTheme } from '@/theme';
import { RingMark } from '../brand/RingMark';
import { Txt } from '../primitives/Txt';

interface AgentMessageProps {
  text: string;
  /** First message of an agent turn: shows the RingMark. */
  startOfTurn?: boolean;
  streaming?: boolean;
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

export function AgentMessage({ text, startOfTurn = true, streaming }: AgentMessageProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={t('agent.a11y.agentMessage', { text: text.replace(/\*\*/g, '') })}
      accessibilityState={{ busy: !!streaming }}
    >
      <View style={styles.mark}>
        {startOfTurn ? <RingMark size={16} color={colors.iconActive} /> : null}
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
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.s2, paddingHorizontal: space.s4 },
  mark: { width: 16, paddingTop: 3 },
  body: { flex: 1, gap: 6 },
  bullet: { flexDirection: 'row', gap: space.s2 },
  flex: { flex: 1 },
});
