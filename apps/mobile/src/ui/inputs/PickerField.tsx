// A field that looks like a text field and opens a picker sheet (date, time).
import { StyleSheet, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { radius, space, useTheme } from '@/theme';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';

interface PickerFieldProps {
  label: string;
  value: string | null;
  placeholder?: string;
  helper?: string;
  error?: string | null;
  onPress: () => void;
}

export function PickerField({ label, value, placeholder, helper, error, onPress }: PickerFieldProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Txt variant="secondaryStrong">{label}</Txt>
      <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${value ?? placeholder ?? ''}`} accessibilityHint={error ?? helper}>
        <View style={[styles.field, { borderColor: error ? colors.statusLate : colors.outline, borderWidth: error ? 2 : 1 }]}>
          <Txt color={value ? 'textPrimary' : 'textSecondary'} style={styles.flex}>{value ?? placeholder}</Txt>
          <ChevronDown size={20} color={colors.iconSecondary} strokeWidth={2} />
        </View>
      </Touchable>
      {error ? <Txt variant="secondary" color="textDanger">{error}</Txt> : helper ? <Txt variant="secondary" color="textSecondary">{helper}</Txt> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.s2 },
  field: { minHeight: 56, borderRadius: radius.group, paddingHorizontal: space.s4, flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  flex: { flex: 1 },
});
