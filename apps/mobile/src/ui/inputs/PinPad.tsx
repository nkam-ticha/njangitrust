// 6-digit PIN pad (DESIGN_SYSTEM.md 5.2, 8.6). A custom keypad, never the system keyboard.
// On the web, a physical keyboard types into it (digits, Backspace) and a 6-digit paste is accepted;
// the matching on-screen key flashes for 120 ms. Submits on the sixth digit.
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Delete } from 'lucide-react-native';
import { duration, fontScaleCaps, radius, space, typography, useTheme } from '@/theme';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';

export const PIN_LENGTH = 6;

export interface PinPadProps {
  value: string;
  onChange: (value: string) => void;
  /** Called with the six digits as soon as the last one is typed. */
  onComplete?: (pin: string) => void;
  /** Shows the dots as error rings until the next digit. */
  error?: boolean;
  disabled?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

export function PinPad({ value, onChange, onComplete, error, disabled }: PinPadProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [flash, setFlash] = useState<string | null>(null);

  const press = (key: string) => {
    if (disabled) return;
    if (key === 'del') {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= PIN_LENGTH) return;
    const next = value + key;
    onChange(next);
    if (next.length === PIN_LENGTH) onComplete?.(next);
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
      else return;
      setFlash(e.key === 'Backspace' ? 'del' : e.key);
      setTimeout(() => setFlash(null), duration.pressOut);
      e.preventDefault();
    };
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text')?.trim() ?? '';
      if (/^\d{6}$/.test(text) && !disabled) {
        onChange(text);
        onComplete?.(text);
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('paste', onPaste);
    };
  });

  return (
    <View style={styles.wrap}>
      <View accessible accessibilityLabel={t('pinSheet.digitsA11y', { count: value.length })} style={styles.dots}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => {
          const filled = i < value.length;
          return (
            <View
              key={i}
              style={[
                styles.dot,
                { borderColor: error ? colors.statusLate : filled ? colors.primary : colors.outline },
                filled && !error && { backgroundColor: colors.primary },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.grid}>
        {KEYS.map((key, i) =>
          key === '' ? (
            <View key={`empty-${i}`} style={styles.key} />
          ) : (
            <Touchable
              key={key}
              onPress={() => press(key)}
              disabled={disabled}
              radius={radius.full}
              accessibilityRole="button"
              accessibilityLabel={key === 'del' ? t('pinSheet.delete') : key}
              style={styles.key}
            >
              <View style={[styles.keyInner, flash === key && { backgroundColor: colors.selectedTint }]}>
                {key === 'del' ? (
                  <Delete size={24} color={colors.iconPrimary} strokeWidth={2} />
                ) : (
                  <Txt style={[typography.bodyStrong, styles.digit]} maxFontSizeMultiplier={fontScaleCaps.pinDigit}>{key}</Txt>
                )}
              </View>
            </Touchable>
          ),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.s4, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: space.s4, paddingVertical: space.s2 },
  dot: { width: 14, height: 14, borderRadius: radius.full, borderWidth: 1.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', maxWidth: 288 },
  key: { width: '33.33%', height: 64, alignItems: 'center', justifyContent: 'center' },
  keyInner: { width: 64, height: 64, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  digit: { fontSize: 24, lineHeight: 30 },
});
