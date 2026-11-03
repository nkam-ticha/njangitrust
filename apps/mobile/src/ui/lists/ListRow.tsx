// List row (DESIGN_SYSTEM.md 5.3): plain rows with dividers, never cards.
// At font scale ≥ 1.5 the trailing block moves under the title, still right-aligned.
import type { ReactNode } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { fontScaleCaps, size, space, useTheme } from '@/theme';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';

export interface ListRowProps {
  title: string;
  /** `strong` for names and things, `regular` for sentences. */
  titleWeight?: 'strong' | 'regular';
  subtitle?: string;
  /** Avatar, a 24 dp icon centred in 40, or a status icon. */
  leading?: ReactNode;
  /** An AmountText, a switch, a text button… */
  trailing?: ReactNode;
  /** A short status under the trailing amount ("en retard"). */
  trailingNote?: ReactNode;
  /** Shows a chevron: the row navigates. */
  chevron?: boolean;
  onPress?: () => void;
  selected?: boolean;
  /** Draws the divider above this row, inset to the text start. */
  divider?: boolean;
  /** Whole-row label for screen readers, in reading order with amounts as words. */
  accessibilityLabel?: string;
}

export function ListRow({ title, titleWeight = 'strong', subtitle, leading, trailing, trailingNote, chevron, onPress, selected, divider, accessibilityLabel }: ListRowProps) {
  const { colors } = useTheme();
  const stacked = PixelRatio.getFontScale() >= fontScaleCaps.rowStack;
  const inset = leading ? space.s4 + size.avatar + space.s3 : space.s4;

  const trailBlock = trailing || trailingNote ? (
    <View style={[styles.trailing, stacked && styles.trailingStacked]}>
      {trailing}
      {trailingNote}
    </View>
  ) : null;

  const body = (
    <View style={[styles.row, selected && { backgroundColor: colors.selectedTint }]}>
      {divider ? <View style={[styles.divider, { left: inset, backgroundColor: colors.divider }]} /> : null}
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.text}>
        <Txt variant={titleWeight === 'strong' ? 'bodyStrong' : 'body'}>{title}</Txt>
        {subtitle ? <Txt variant="secondary" color="textSecondary">{subtitle}</Txt> : null}
        {stacked ? trailBlock : null}
      </View>
      {stacked ? null : trailBlock}
      {chevron ? <ChevronRight size={20} color={colors.iconSecondary} strokeWidth={2} /> : null}
    </View>
  );

  if (!onPress) {
    return (
      <View accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }
  return (
    <Touchable onPress={onPress} radius={0} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ selected: !!selected }}>
      {body}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: size.rowMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    paddingHorizontal: space.s4,
    paddingVertical: space.s3,
  },
  divider: { position: 'absolute', top: 0, right: 0, height: 1 },
  leading: { width: size.avatar, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  trailing: { alignItems: 'flex-end', flexShrink: 0 },
  trailingStacked: { alignSelf: 'stretch', marginTop: space.s1 },
});
