// Date field with an in-house month grid in a sheet (DESIGN_SYSTEM.md 5.2, DD-25).
// Values are Douala calendar days, `YYYY-MM-DD`. Names come from @njangi/shared's formatters.
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { formatDateLong } from '@njangi/shared';
import { radius, size, space, useTheme } from '@/theme';
import { BottomSheet } from '../sheets/BottomSheet';
import { Button } from '../buttons/Button';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';
import { useLang } from '../primitives/useLang';
import { PickerField } from './PickerField';

interface DateFieldProps {
  label: string;
  value: string | null;
  onChange: (isoDay: string) => void;
  /** Earliest selectable day, `YYYY-MM-DD` (today for future dates). */
  minDay?: string;
  /** Today in Douala, `YYYY-MM-DD` (passed in: the UI never reads the clock for rules). */
  today: string;
  helper?: string;
  error?: string | null;
}

const atNoon = (iso: string) => `${iso}T12:00:00Z`;
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function DateField({ label, value, onChange, minDay, today, helper, error }: DateFieldProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(value);
  const start = (value ?? today).split('-').map(Number);
  const [month, setMonth] = useState({ y: start[0] ?? 2026, m: start[1] ?? 1 });

  // Monday-first weekday initials from the shared formatter (2 November 2026 is a Monday).
  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => formatDateLong(atNoon(iso(2026, 11, 2 + i)), lang).split(' ')[0]!.slice(0, 3)),
    [lang],
  );
  const title = formatDateLong(atNoon(iso(month.y, month.m, 1)), lang, { withYear: true }).split(' ').slice(2).join(' ');
  const firstWeekday = (new Date(Date.UTC(month.y, month.m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
  const cells: Array<number | null> = [...Array(firstWeekday).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const shift = (delta: number) => {
    const m = month.m + delta;
    setMonth({ y: month.y + Math.floor((m - 1) / 12), m: ((m - 1 + 12) % 12) + 1 });
  };

  return (
    <>
      <PickerField
        label={label}
        value={value ? formatDateLong(atNoon(value), lang, { withYear: true }) : null}
        helper={helper}
        error={error}
        onPress={() => {
          setDraft(value);
          setOpen(true);
        }}
      />
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        dialogWidth={400}
        footer={<Button fullWidth label={t('common.actions.confirm')} disabled={!draft} onPress={() => { if (draft) onChange(draft); setOpen(false); }} />}
      >
        <View style={styles.monthRow}>
          <Touchable onPress={() => shift(-1)} radius={24} accessibilityRole="button" accessibilityLabel={t('common.actions.previous')} style={styles.nav}>
            <ChevronLeft size={24} color={colors.iconPrimary} strokeWidth={2} />
          </Touchable>
          <Txt variant="bodyStrong" accessibilityRole="header">{title}</Txt>
          <Touchable onPress={() => shift(1)} radius={24} accessibilityRole="button" accessibilityLabel={t('common.actions.next')} style={styles.nav}>
            <ChevronRight size={24} color={colors.iconPrimary} strokeWidth={2} />
          </Touchable>
        </View>
        <View style={styles.grid}>
          {weekdays.map((w, i) => (
            <View key={`w${i}`} style={styles.cell} importantForAccessibility="no">
              <Txt variant="captionStrong" color="textSecondary">{w}</Txt>
            </View>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <View key={`e${i}`} style={styles.cell} />;
            const day = iso(month.y, month.m, d);
            const disabled = !!minDay && day < minDay;
            const selected = day === draft;
            return (
              <Touchable
                key={day}
                disabled={disabled}
                onPress={() => setDraft(day)}
                radius={radius.full}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled }}
                accessibilityLabel={formatDateLong(atNoon(day), lang, { withYear: true })}
                style={styles.cell}
              >
                <View style={[styles.day, selected && { backgroundColor: colors.primary }, day === today && !selected && { borderWidth: 1.5, borderColor: colors.primary }]}>
                  <Txt color={selected ? 'textOnPrimary' : disabled ? 'textSecondary' : 'textPrimary'}>{d}</Txt>
                </View>
              </Touchable>
            );
          })}
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nav: { width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  day: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
});
