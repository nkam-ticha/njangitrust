// Initials in a circle (DESIGN_SYSTEM.md 5.5). No photos, no per-person colours.
// Decorative for screen readers: the name beside it is read. The agent uses the RingMark.
import { StyleSheet, View } from 'react-native';
import { radius, typography, useTheme } from '@/theme';
import { Txt } from '../primitives/Txt';
import { RingMark } from '../brand/RingMark';

export type AvatarSize = 32 | 40 | 56;

interface AvatarProps {
  name?: string;
  size?: AvatarSize;
  /** The agent's avatar. */
  agent?: boolean;
  /** Raffia ring for the round's beneficiary. */
  beneficiary?: boolean;
}

/** First letters of the first two words: "Carine Fotso" → "CF", "Ivo" → "I". */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('fr'))
    .join('');
}

export function Avatar({ name = '', size = 40, agent, beneficiary }: AvatarProps) {
  const { colors } = useTheme();
  const text = size === 56 ? typography.groupTitle : size === 40 ? typography.bodyStrong : typography.captionStrong;
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        styles.base,
        { width: size, height: size, backgroundColor: colors.selectedTint },
        beneficiary && { borderWidth: 2, borderColor: colors.raffiaKeyline },
      ]}
    >
      {agent ? <RingMark size={size === 32 ? 18 : 24} color={colors.iconActive} /> : <Txt style={[text, { color: colors.textLink }]}>{initials(name)}</Txt>}
      {beneficiary ? <View style={[styles.dot, { backgroundColor: colors.accentRaffia, borderColor: colors.raffiaKeyline }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderRadius: radius.full, borderWidth: 1.5 },
});
