// Chips (DESIGN_SYSTEM.md 5.4): context chips (Njangi tab), filter chips (Registre),
// quick-amount chips. 40 high, 48 dp target; selection is fill plus a check, not colour alone.
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react-native';
import { radius, space, useTheme } from '@/theme';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';

interface ChipProps {
  label: string;
  onPress?: () => void;
  /** Filter chips only. */
  selected?: boolean;
  kind?: 'context' | 'filter';
  disabled?: boolean;
}

export function Chip({ label, onPress, selected = false, kind = 'context', disabled }: ChipProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const on = kind === 'filter' && selected;
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      radius={radius.full}
      accessibilityRole={kind === 'filter' ? 'checkbox' : 'button'}
      accessibilityLabel={kind === 'context' ? t('agent.chips.a11yLabel', { label }) : label}
      accessibilityState={kind === 'filter' ? { checked: on, disabled: !!disabled } : { disabled: !!disabled }}
      hitSlop={4}
      style={styles.touch}
    >
      <View
        style={[
          styles.chip,
          { borderColor: on ? colors.primary : colors.outline, backgroundColor: on ? colors.primary : 'transparent' },
        ]}
      >
        {on ? <Check size={16} color={colors.textOnPrimary} strokeWidth={2} /> : null}
        <Txt variant="secondaryStrong" style={{ color: on ? colors.textOnPrimary : disabled ? colors.textSecondary : colors.textLink }} numberOfLines={1}>
          {label}
        </Txt>
      </View>
    </Touchable>
  );
}

interface ChipRowProps {
  children: ReactNode;
  /** Group label for screen readers ("Suggestions"). */
  label?: string;
}

/** Chips in one horizontally scrolling row with 16 dp gutters and 8 dp gaps. */
export function ChipRow({ children, label }: ChipRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={label}
      contentContainerStyle={styles.row}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  touch: { alignSelf: 'flex-start' },
  chip: {
    minHeight: 40,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: space.s4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  row: { paddingHorizontal: space.s4, paddingVertical: space.s1, gap: space.s2, alignItems: 'center' },
});
