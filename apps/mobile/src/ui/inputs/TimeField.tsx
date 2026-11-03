// Time field with an in-house list of times every 15 minutes in a sheet (DESIGN_SYSTEM.md 5.2).
// Values are Douala times, `HH:mm`; display uses @njangi/shared's formatClock.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { formatClock } from '@njangi/shared';
import { size, space, useTheme } from '@/theme';
import { BottomSheet } from '../sheets/BottomSheet';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';
import { useLang } from '../primitives/useLang';
import { PickerField } from './PickerField';

interface TimeFieldProps {
  label: string;
  value: string | null;
  onChange: (hhmm: string) => void;
  helper?: string;
}

const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);
const asInstant = (hhmm: string) => `2026-01-01T${hhmm}:00+01:00`;

export function TimeField({ label, value, onChange, helper }: TimeFieldProps) {
  const { colors } = useTheme();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PickerField label={label} value={value ? formatClock(asInstant(value), lang) : null} helper={helper} onPress={() => setOpen(true)} />
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={label} dialogWidth={400}>
        {TIMES.map((time) => {
          const on = time === value;
          return (
            <Touchable
              key={time}
              onPress={() => {
                onChange(time);
                setOpen(false);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <View style={[styles.row, on && { backgroundColor: colors.selectedTint }]}>
                <Txt variant={on ? 'bodyStrong' : 'body'} style={styles.flex}>{formatClock(asInstant(time), lang)}</Txt>
                {on ? <Check size={20} color={colors.iconActive} strokeWidth={2} /> : null}
              </View>
            </Touchable>
          );
        })}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: size.touch, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.s3, borderRadius: 12 },
  flex: { flex: 1 },
});
