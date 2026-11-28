// The loan amount (R7, LOA-01): the typed amount stays the exact way in (whole FCFA), and under it a
// slider, "-" and "+" buttons and one-tap amounts make a large amount easy on a phone. The range is
// the server's limit; the app only chooses a value inside it and never calculates money.
// Keyboard: the slider takes the arrow, page, Home and End keys. Screen readers: the slider is
// adjustable (swipe up or down), the buttons and chips are named.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react-native';
import { formatXAF } from '@njangi/shared';
import { radius, size, space, useTheme } from '@/theme';
import { AmountInput, Chip, ChipRow, Slider, Touchable, useLang } from '@/ui';
import { clamp, nudge, presetAmounts } from '@/ui/inputs/sliderMath';

interface LoanAmountControlProps {
  value: number | null;
  onChange: (amount: number | null) => void;
  /** The most the member may borrow now (the server's figure); null when it is not known. */
  limit: number | null;
}

/** The smallest amount the slider starts from. A loan has no minimum beyond being positive (D11). */
const SLIDER_FLOOR = 1000;

export function LoanAmountControl({ value, onChange, limit }: LoanAmountControlProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const { colors } = useTheme();
  const usable = limit !== null && limit > 0;
  const min = usable ? Math.min(SLIDER_FLOOR, limit) : 0;
  const current = value === null ? min : clamp(value, min, usable ? limit : value);

  const step = (direction: 1 | -1) => {
    if (!usable) return;
    onChange(nudge(current, direction, min, limit));
  };

  return (
    <View style={styles.column}>
      <AmountInput
        label={t('loans.request.amount')}
        value={value}
        onChange={onChange}
        max={usable ? limit : undefined}
        helper={usable ? t('loans.request.limit', { amount: formatXAF(limit, lang) }) : undefined}
      />
      {usable && limit > min ? (
        <>
          <View style={styles.sliderRow}>
            <Touchable
              onPress={() => step(-1)}
              radius={radius.full}
              accessibilityRole="button"
              accessibilityLabel={t('loans.request.decrease')}
              style={[styles.stepper, { borderColor: colors.outline }]}
            >
              <Minus size={20} color={colors.iconPrimary} strokeWidth={2} />
            </Touchable>
            <View style={styles.slider}>
              <Slider
                value={current}
                min={min}
                max={limit}
                onChange={onChange}
                accessibilityLabel={t('loans.request.amount')}
              />
            </View>
            <Touchable
              onPress={() => step(1)}
              radius={radius.full}
              accessibilityRole="button"
              accessibilityLabel={t('loans.request.increase')}
              style={[styles.stepper, { borderColor: colors.outline }]}
            >
              <Plus size={20} color={colors.iconPrimary} strokeWidth={2} />
            </Touchable>
          </View>
          <ChipRow label={t('loans.request.presets')}>
            {presetAmounts(limit).map((amount) => (
              <Chip
                key={amount}
                kind="filter"
                label={formatXAF(amount, lang)}
                selected={value === amount}
                onPress={() => onChange(amount)}
              />
            ))}
            <Chip
              kind="filter"
              label={t('loans.request.max')}
              selected={value === limit}
              onPress={() => onChange(limit)}
            />
          </ChipRow>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.s2 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  slider: { flex: 1, minWidth: 0 },
  stepper: {
    width: size.touch,
    height: size.touch,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
