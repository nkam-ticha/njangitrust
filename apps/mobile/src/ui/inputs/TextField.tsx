// Text field (DESIGN_SYSTEM.md 5.2): label above, helper or error below, 56 high, radius 12.
// Focus: 2 px primary border; error: 2 px late border and a message with an icon.
import { useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
import { radius, space, typography, useTheme } from '@/theme';
import { Txt } from '../primitives/Txt';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label: string;
  helper?: string;
  error?: string | null;
  /** Fixed content before the input ("+237"). */
  prefix?: ReactNode;
  /** Content after the input (the operator badge). */
  suffix?: ReactNode;
  /** Larger value text, for amounts. */
  large?: boolean;
}

export function TextField({ label, helper, error, prefix, suffix, large, multiline, onFocus, onBlur, editable = true, ...rest }: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const border = error ? colors.statusLate : focused ? colors.primary : colors.outline;
  const width = error || focused ? 2 : 1;
  return (
    <View style={styles.wrap}>
      <Txt variant="secondaryStrong">{label}</Txt>
      <View
        style={[
          styles.field,
          { borderColor: border, borderWidth: width, padding: space.s4 - width, backgroundColor: editable ? 'transparent' : colors.disabledFill },
          multiline && styles.multi,
        ]}
      >
        {prefix}
        <TextInput
          {...rest}
          editable={editable}
          multiline={multiline}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          accessibilityHint={error ?? helper}
          placeholderTextColor={colors.textSecondary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[large ? typography.amountDisplay : typography.body, styles.input, { color: colors.textPrimary }, large && styles.right]}
        />
        {suffix}
      </View>
      {error ? (
        <View style={styles.msg} accessibilityLiveRegion="polite">
          <CircleAlert size={16} color={colors.statusLate} strokeWidth={2} />
          <Txt variant="secondary" color="textDanger" style={styles.flex}>{error}</Txt>
        </View>
      ) : helper ? (
        <Txt variant="secondary" color="textSecondary">{helper}</Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.s2 },
  field: { minHeight: 56, borderRadius: radius.group, flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  multi: { alignItems: 'flex-start', minHeight: 96 },
  input: { flex: 1, minWidth: 0, padding: 0, outlineWidth: 0 },
  right: { textAlign: 'right' },
  msg: { flexDirection: 'row', gap: space.s2, alignItems: 'flex-start' },
  flex: { flex: 1 },
});
