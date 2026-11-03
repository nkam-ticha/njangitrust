// Section header (DESIGN_SYSTEM.md 5.3): "Payé (7)" with an optional trailing text button.
import { StyleSheet, View } from 'react-native';
import { space } from '@/theme';
import { Txt } from '../primitives/Txt';
import { Button } from '../buttons/Button';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Txt variant="sectionTitle" accessibilityRole="header" style={styles.title}>{title}</Txt>
      {actionLabel && onAction ? <Button variant="text" label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.s4,
    paddingTop: space.s6,
    paddingBottom: space.s2,
    gap: space.s2,
  },
  title: { flex: 1 },
});
