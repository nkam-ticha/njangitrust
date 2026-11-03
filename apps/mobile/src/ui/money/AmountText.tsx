// The only component that displays money (spec 1.5, DESIGN_SYSTEM.md 5.17).
// Text comes from formatXAF; screen readers hear amountToWords ("onze mille francs CFA").
// The figure leads; "FCFA" is set one step smaller in secondary ink.
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { NBSP, amountToWords, formatXAF } from '@njangi/shared';
import { typography, useTheme, type TypeStyleName } from '@/theme';
import { useLang } from '../primitives/useLang';

export type AmountSize = 'display' | 'large' | 'total' | 'body' | 'small';

const FIGURE: Record<AmountSize, TypeStyleName> = {
  display: 'amountDisplay',
  large: 'amountLarge',
  total: 'amountTotal',
  body: 'amount',
  small: 'amountSmall',
};
const SUFFIX_SIZE: Record<AmountSize, { fontSize: number; lineHeight: number }> = {
  display: { fontSize: 19, lineHeight: 40 },
  large: { fontSize: 16, lineHeight: 30 },
  total: { fontSize: 14, lineHeight: 24 },
  body: { fontSize: 14, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 20 },
};

export interface AmountTextProps {
  /** Integer FCFA. */
  amount: number;
  size?: AmountSize;
  /** `always` adds "+" to positive amounts (Registre, breakdowns). */
  sign?: 'auto' | 'always';
  /** `none` drops "FCFA" (ring centre "sur 100 000"). */
  currency?: 'suffix' | 'none';
  tone?: 'primary' | 'secondary';
  align?: 'left' | 'right' | 'center';
  style?: StyleProp<TextStyle>;
}

/** Spoken form with an explicit sign for signed amounts. */
export function amountLabel(amount: number, lang: 'fr' | 'en', sign: 'auto' | 'always' = 'auto'): string {
  const words = amountToWords(amount, lang);
  return sign === 'always' && amount > 0 ? `plus ${words}` : words;
}

export function AmountText({ amount, size = 'body', sign = 'auto', currency = 'suffix', tone = 'primary', align = 'right', style }: AmountTextProps) {
  const { colors } = useTheme();
  const lang = useLang();
  const full = formatXAF(amount, lang, { sign });
  const cut = full.lastIndexOf(NBSP);
  const figure = full.slice(0, cut);
  const figureStyle = typography[FIGURE[size]];
  return (
    <Text
      accessible
      accessibilityLabel={amountLabel(amount, lang, sign)}
      numberOfLines={1}
      style={[figureStyle, { color: tone === 'secondary' ? colors.textSecondary : colors.textPrimary, textAlign: align }, style]}
    >
      {figure}
      {currency === 'suffix' ? (
        <Text style={[{ fontFamily: figureStyle.fontFamily, color: colors.textSecondary }, SUFFIX_SIZE[size]]}>
          {full.slice(cut)}
        </Text>
      ) : null}
    </Text>
  );
}
