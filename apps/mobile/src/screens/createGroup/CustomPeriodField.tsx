// A custom round period typed as a number and a unit (D23): from 1 minute up to 365 days.
// The value held by the parent is always whole minutes; 0 means "not a valid period yet".
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  MAX_CUSTOM_PERIOD_MINUTES,
  MIN_CUSTOM_PERIOD_MINUTES,
  periodMinutes,
  splitPeriod,
  type PeriodUnit,
} from '@njangi/rules';
import { space } from '@/theme';
import { Chip, ChipRow, TextField, Txt } from '@/ui';

const UNITS: PeriodUnit[] = ['minutes', 'hours', 'days'];

/** Shortcuts for the usual choices; anything else is typed. */
const QUICK: { count: number; unit: PeriodUnit }[] = [
  { count: 1, unit: 'minutes' },
  { count: 5, unit: 'minutes' },
  { count: 1, unit: 'hours' },
  { count: 1, unit: 'days' },
  { count: 7, unit: 'days' },
];

interface CustomPeriodFieldProps {
  /** Whole minutes between two rounds. */
  value: number;
  onChange: (minutes: number) => void;
}

export function CustomPeriodField({ value, onChange }: CustomPeriodFieldProps) {
  const { t } = useTranslation();
  const initial = splitPeriod(value);
  const [text, setText] = useState(String(initial.count));
  const [unit, setUnit] = useState<PeriodUnit>(initial.unit);

  const apply = (nextText: string, nextUnit: PeriodUnit) => {
    setText(nextText);
    setUnit(nextUnit);
    const count = nextText ? Number(nextText) : 0;
    onChange(count > 0 ? periodMinutes(count, nextUnit) : 0);
  };

  const minutes = text ? periodMinutes(Number(text), unit) : null;
  const error =
    minutes === null
      ? null
      : minutes < MIN_CUSTOM_PERIOD_MINUTES
        ? t('errors.validation.periodMin')
        : minutes > MAX_CUSTOM_PERIOD_MINUTES
          ? t('errors.validation.periodMax')
          : null;

  return (
    <View style={styles.wrap}>
      <Txt variant="secondaryStrong">{t('createGroup.schedule.custom.title')}</Txt>
      <TextField
        label={t('createGroup.schedule.custom.number')}
        large
        value={text}
        onChangeText={(input) =>
          apply(input.replace(/\D/g, '').replace(/^0+/, '').slice(0, 6), unit)
        }
        keyboardType="number-pad"
        placeholder="1"
        error={error}
        helper={t('createGroup.schedule.custom.help')}
      />
      <Txt variant="secondaryStrong">{t('createGroup.schedule.custom.unit')}</Txt>
      <ChipRow>
        {UNITS.map((u) => (
          <Chip
            key={u}
            kind="filter"
            label={t(`createGroup.schedule.custom.units.${u}`)}
            selected={unit === u}
            onPress={() => apply(text, u)}
          />
        ))}
      </ChipRow>
      <ChipRow>
        {QUICK.map((q) => (
          <Chip
            key={`${q.count}-${q.unit}`}
            kind="filter"
            label={t(`createGroup.schedule.custom.short.${q.unit}`, { count: q.count })}
            selected={value === periodMinutes(q.count, q.unit)}
            onPress={() => apply(String(q.count), q.unit)}
          />
        ))}
      </ChipRow>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.s2 },
});
