// Switch row (DESIGN_SYSTEM.md 5.2): React Native's Switch in a labelled row.
// A switch that can't change (Sécurité notifications) is on, disabled, with the reason below.
import { StyleSheet, Switch, View } from 'react-native';
import { size, space, useTheme } from '@/theme';
import { Txt } from '../primitives/Txt';

interface SwitchRowProps {
  label: string;
  helper?: string;
  value: boolean;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
}

export function SwitchRow({ label, helper, value, onChange, disabled }: SwitchRowProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Txt>{label}</Txt>
        {helper ? <Txt variant="secondary" color="textSecondary">{helper}</Txt> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        accessibilityHint={helper}
        trackColor={{ false: colors.outline, true: colors.primary }}
        thumbColor={colors.canvas}
        ios_backgroundColor={colors.outline}
      />
    </View>
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
  text: { flex: 1, minWidth: 0 },
});
