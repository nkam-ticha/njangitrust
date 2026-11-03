// Phone field (DESIGN_SYSTEM.md 5.2): fixed "+237", 9 digits grouped 3-2-2-2 as typed,
// operator badge from detectOperator once 3 digits are in. Pastes of "+237…" or "00237…" are
// normalised. Reports the E.164 value (or null while incomplete or invalid).
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { detectOperator, normalizeCameroonPhone, type Operator } from '@njangi/shared';
import { space, useTheme } from '@/theme';
import { Txt } from '../primitives/Txt';
import { LabelBadge } from '../identity/Badge';
import { TextField } from './TextField';

interface PhoneFieldProps {
  label: string;
  helper?: string;
  error?: string | null;
  /** National digits already typed (for a prefilled, locked invite number). */
  initialDigits?: string;
  editable?: boolean;
  onChange: (e164: string | null, operator: Operator | null) => void;
}

function group(d: string): string {
  return [d.slice(0, 3), d.slice(3, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
}

export function PhoneField({ label, helper, error, initialDigits = '', editable = true, onChange }: PhoneFieldProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [digits, setDigits] = useState(initialDigits);
  const operator: Operator | null = digits.length >= 3 && digits.startsWith('6') ? detectOperator(`+237${digits.padEnd(9, '0')}`) : null;

  const handle = (text: string) => {
    const pasted = normalizeCameroonPhone(text);
    const next = pasted ? pasted.slice(4) : text.replace(/\D/g, '').slice(0, 9);
    setDigits(next);
    const e164 = next.length === 9 ? normalizeCameroonPhone(next) : null;
    onChange(e164, e164 ? detectOperator(e164) : null);
  };

  return (
    <TextField
      label={label}
      helper={helper}
      error={error}
      editable={editable}
      value={group(digits)}
      onChangeText={handle}
      keyboardType="phone-pad"
      autoComplete="tel"
      textContentType="telephoneNumber"
      accessibilityLabel={`${label}, +237`}
      placeholder="6XX XX XX XX"
      prefix={
        <View style={[styles.prefix, { borderRightColor: colors.divider }]}>
          <Txt color="textSecondary">+237</Txt>
        </View>
      }
      suffix={
        operator ? (
          <LabelBadge label={operator === 'UNKNOWN' ? t('common.operators.UNKNOWN') : t(`common.operators.${operator}`)} />
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  prefix: { borderRightWidth: 1, paddingRight: space.s3 },
});
