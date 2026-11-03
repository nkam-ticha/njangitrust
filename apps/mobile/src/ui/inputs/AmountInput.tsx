// Amount input (DESIGN_SYSTEM.md 5.2): the value in amountDisplay, formatted live with
// formatXAF's figure, integers only, the allowed range or balance below, optional quick chips.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { NBSP, formatXAF } from '@njangi/shared';
import { space } from '@/theme';
import { Txt } from '../primitives/Txt';
import { useLang } from '../primitives/useLang';
import { amountLabel } from '../money/AmountText';
import { Chip, ChipRow } from '../chips/Chip';
import { TextField } from './TextField';

export interface QuickAmount {
  label: string;
  amount: number;
}

interface AmountInputProps {
  label: string;
  /** Integer FCFA, or null when empty. */
  value: number | null;
  onChange: (amount: number | null) => void;
  min?: number;
  max?: number;
  helper?: string;
  quick?: QuickAmount[];
}

export function AmountInput({ label, value, onChange, min, max, helper, quick }: AmountInputProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const figure = (n: number) => {
    const s = formatXAF(n, lang);
    return s.slice(0, s.lastIndexOf(NBSP));
  };
  const error =
    value === null
      ? null
      : min !== undefined && value < min
        ? t('errors.validation.amountMin', { amount: formatXAF(min, lang) })
        : max !== undefined && value > max
          ? t('errors.validation.amountMax', { amount: formatXAF(max, lang) })
          : null;

  return (
    <View style={styles.wrap}>
      <TextField
        label={label}
        large
        value={value === null ? '' : figure(value)}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 9);
          onChange(digits ? Number(digits) : null);
        }}
        keyboardType="number-pad"
        accessibilityLabel={value === null ? label : `${label}, ${amountLabel(value, lang)}`}
        placeholder="0"
        error={error}
        helper={helper}
        suffix={<Txt variant="groupTitle" color="textSecondary">FCFA</Txt>}
      />
      {quick?.length ? (
        <ChipRow>
          {quick.map((q) => (
            <Chip key={q.label} kind="filter" label={q.label} selected={value === q.amount} onPress={() => onChange(q.amount)} />
          ))}
        </ChipRow>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.s2 },
});
