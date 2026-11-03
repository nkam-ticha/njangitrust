// Choice rows (DESIGN_SYSTEM.md 5.2): radio and check marks are circles (DD-22), always inside
// a full-width row that is the whole target. The consent checkbox is one of these.
import { StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { radius, size, space, useTheme } from '@/theme';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';

interface ChoiceRowProps {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  kind?: 'radio' | 'check';
  disabled?: boolean;
}

export function ChoiceRow({ label, description, selected, onPress, kind = 'radio', disabled }: ChoiceRowProps) {
  const { colors } = useTheme();
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={kind === 'radio' ? 'radio' : 'checkbox'}
      accessibilityState={kind === 'radio' ? { selected, disabled: !!disabled } : { checked: selected, disabled: !!disabled }}
      accessibilityLabel={description ? `${label}, ${description}` : label}
    >
      <View style={[styles.row, { borderColor: selected ? colors.primary : colors.divider }]}>
        <View
          style={[
            styles.mark,
            { borderColor: selected ? colors.primary : colors.outline },
            kind === 'check' && selected && { backgroundColor: colors.primary },
          ]}
        >
          {selected && kind === 'radio' ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
          {selected && kind === 'check' ? <Check size={14} color={colors.textOnPrimary} strokeWidth={3} /> : null}
        </View>
        <View style={styles.text}>
          <Txt color={disabled ? 'textSecondary' : 'textPrimary'}>{label}</Txt>
          {description ? <Txt variant="secondary" color="textSecondary">{description}</Txt> : null}
        </View>
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: size.rowMin,
    borderWidth: 1,
    borderRadius: radius.group,
    paddingHorizontal: space.s4,
    paddingVertical: space.s3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
  },
  mark: { width: 22, height: 22, borderRadius: radius.full, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: radius.full },
  text: { flex: 1, minWidth: 0 },
});
