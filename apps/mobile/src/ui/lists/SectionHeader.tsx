// Section header (DESIGN_SYSTEM.md 5.3): "Payé (7)" with an optional trailing text button.
import { StyleSheet, View } from 'react-native';
import { space } from '@/theme';
import { Txt } from '../primitives/Txt';
import { Button } from '../buttons/Button';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  /** False when the header sits in a column that already has the screen gutter. */
  inset?: boolean;
}

export function SectionHeader({ title, actionLabel, onAction, inset = true }: SectionHeaderProps) {
  return (
    <View style={[styles.row, inset ? styles.inset : null]}>
      <Txt variant="sectionTitle" accessibilityRole="header" style={styles.title}>
        {title}
      </Txt>
      {actionLabel && onAction ? (
        <Button variant="text" label={actionLabel} onPress={onAction} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.s6,
    paddingBottom: space.s2,
    gap: space.s2,
  },
  inset: { paddingHorizontal: space.s4 },
  title: { flex: 1 },
});
