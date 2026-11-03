// Empty state (DESIGN_SYSTEM.md 5.15): icon, title, what to do next, at most one button.
import { StyleSheet, View } from 'react-native';
import { space, useTheme } from '@/theme';
import { Txt } from '../primitives/Txt';
import { Button } from '../buttons/Button';
import type { IconComponent } from '../primitives/Icon';

interface EmptyStateProps {
  icon: IconComponent;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Glyph, title, body, actionLabel, onAction }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Glyph size={32} color={colors.iconSecondary} strokeWidth={2} />
      <Txt variant="sectionTitle" align="center">{title}</Txt>
      {body ? <Txt color="textSecondary" align="center">{body}</Txt> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={styles.btn} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.s2, paddingHorizontal: space.s6, paddingTop: space.s10, maxWidth: 320 + space.s12, alignSelf: 'center' },
  btn: { alignSelf: 'center', marginTop: space.s2 },
});
