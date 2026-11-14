// Reliability (R14; DESIGN_SYSTEM.md 5.26): "92 % · 11 sur 12 à temps", or "Nouveau membre" under
// 3 due items. No colour, gauge or ranking (DD-26). The info button reveals the formula inline.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react-native';
import { space, useTheme } from '@/theme';
import { LabelBadge } from '../identity/Badge';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';

export interface ReliabilityValue {
  /** Null when fewer than 3 due items (R14.2). */
  score: number | null;
  onTime: number;
  due: number;
  window: number;
}

export function Reliability({
  value,
  withFormula = true,
}: {
  value: ReliabilityValue;
  withFormula?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (value.score === null) {
    return (
      <View style={styles.col}>
        <LabelBadge label={t('reliability.newMember')} />
        <Txt variant="secondary" color="textSecondary">
          {t('reliability.newMemberHelp')}
        </Txt>
      </View>
    );
  }
  return (
    <View style={styles.col}>
      <View
        style={styles.row}
        accessible
        accessibilityLabel={t('reliability.a11y', {
          score: value.score,
          onTime: value.onTime,
          due: value.due,
        })}
      >
        <Txt variant="bodyStrong">{t('reliability.score', { score: value.score })}</Txt>
        <Txt variant="secondary" color="textSecondary" style={styles.flex}>
          {t('reliability.value', { onTime: value.onTime, due: value.due })}
        </Txt>
        {withFormula ? (
          <Touchable
            onPress={() => setOpen((o) => !o)}
            radius={24}
            accessibilityRole="button"
            accessibilityLabel={t('reliability.formula.title')}
            accessibilityState={{ expanded: open }}
            style={styles.info}
          >
            <Info size={20} color={colors.iconSecondary} strokeWidth={2} />
          </Touchable>
        ) : null}
      </View>
      {open ? (
        <View style={[styles.formula, { backgroundColor: colors.surfaceTint }]}>
          <Txt variant="secondaryStrong">{t('reliability.formula.title')}</Txt>
          <Txt variant="secondary">{t('reliability.formula.body', { window: value.window })}</Txt>
          <Txt variant="secondary">{t('reliability.formula.equation')}</Txt>
          <Txt variant="secondary">{t('reliability.formula.onTimeRule')}</Txt>
          <Txt variant="secondary">
            {t('reliability.formula.example', {
              onTime: value.onTime,
              due: value.due,
              score: value.score,
            })}
          </Txt>
          <Txt variant="secondary" color="textSecondary">
            {t('reliability.formula.privacy')}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: space.s2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  info: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  formula: { borderRadius: 12, padding: space.s3, gap: space.s1 },
  flex: { flex: 1 },
});
