// System events and result events (spec 1.5, 4.5; DESIGN_SYSTEM.md 5.23, 5.24): compact centred
// rows, not bubbles. Events that link somewhere end with a chevron and are buttons.
import { StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { space, useTheme, type ThemeColors } from '@/theme';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';
import type { IconComponent } from '../primitives/Icon';

interface SystemEventProps {
  icon: IconComponent;
  iconColor?: keyof ThemeColors;
  text: string;
  time?: string;
  onPress?: () => void;
}

export function SystemEvent({ icon: Glyph, iconColor = 'iconSecondary', text, time, onPress }: SystemEventProps) {
  const { colors } = useTheme();
  const content = (
    <View style={styles.row}>
      <Glyph size={16} color={colors[iconColor]} strokeWidth={2} />
      <Txt variant="secondary" color="textSecondary" align="center" style={styles.text}>
        {time ? `${text} · ${time}` : text}
      </Txt>
      {onPress ? <ChevronRight size={16} color={colors.iconSecondary} strokeWidth={2} /> : null}
    </View>
  );
  if (!onPress) return <View accessible accessibilityLabel={text}>{content}</View>;
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={text} style={styles.touch}>
      {content}
    </Touchable>
  );
}

/** Centred date separator ("Aujourd’hui", "lundi 2 novembre"). */
export function DateSeparator({ label }: { label: string }) {
  return (
    <Txt variant="captionStrong" color="textSecondary" align="center" accessibilityRole="header" style={styles.date}>
      {label}
    </Txt>
  );
}

/** "3 nouveaux messages" across a 1 px primary line. */
export function UnreadDivider({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.unread} accessible accessibilityLabel={label}>
      <View style={[styles.rule, { backgroundColor: colors.primary }]} />
      <Txt variant="captionStrong" color="textLink">{label}</Txt>
      <View style={[styles.rule, { backgroundColor: colors.primary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  touch: { alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 6, paddingHorizontal: space.s8, paddingVertical: space.s1, maxWidth: 360, alignSelf: 'center' },
  text: { flexShrink: 1 },
  date: { paddingVertical: space.s2 },
  unread: { flexDirection: 'row', alignItems: 'center', gap: space.s2, paddingHorizontal: space.s4, paddingVertical: space.s2 },
  rule: { flex: 1, height: 1 },
});
