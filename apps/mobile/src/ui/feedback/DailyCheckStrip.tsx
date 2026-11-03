// Daily check strip (spec 1.4, DESIGN_SYSTEM.md 5.13): the latest reconciliation.
// OK and WARNING are plain rows; ALERT is a bordered block on the danger tint.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Clock, ShieldAlert, ShieldCheck } from 'lucide-react-native';
import { radius, size, space, useTheme } from '@/theme';
import { Touchable } from '../primitives/Touchable';
import { Txt } from '../primitives/Txt';
import { Button } from '../buttons/Button';

export type DailyCheckStatus = 'OK' | 'WARNING' | 'ALERT' | 'NOT_YET' | 'STALE';

interface DailyCheckStripProps {
  status: DailyCheckStatus;
  /** Time of the run, formatted ("06:00"). */
  time?: string;
  /** Date of the last run, formatted, for STALE. */
  lastDate?: string;
  onPress: () => void;
}

export function DailyCheckStrip({ status, time = '06:00', lastDate = '', onPress }: DailyCheckStripProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (status === 'ALERT') {
    const [first, ...rest] = [t('caisse.dailyCheck.alert', { time }), t('caisse.dailyCheck.sheet.alertBody')];
    return (
      <View accessibilityRole="alert" style={[styles.alert, { backgroundColor: colors.dangerTint }]}>
        <ShieldAlert size={24} color={colors.statusLate} strokeWidth={2} />
        <View style={styles.flex}>
          <Txt variant="bodyStrong">{first}</Txt>
          <Txt variant="secondary">{rest.join(' ')}</Txt>
          <Button variant="text" label={t('caisse.dailyCheck.details')} onPress={onPress} style={styles.alertBtn} />
        </View>
      </View>
    );
  }

  const text =
    status === 'OK'
      ? t('caisse.dailyCheck.ok', { time })
      : status === 'WARNING'
        ? t('caisse.dailyCheck.warning', { time })
        : status === 'STALE'
          ? t('caisse.dailyCheck.stale', { date: lastDate })
          : t('caisse.dailyCheck.notYet');
  const icon =
    status === 'OK' ? <ShieldCheck size={20} color={colors.statusPaid} strokeWidth={2} /> : <Clock size={20} color={status === 'WARNING' ? colors.statusPending : colors.iconSecondary} strokeWidth={2} />;

  return (
    <Touchable onPress={onPress} radius={0} accessibilityRole="button" accessibilityLabel={status === 'OK' ? t('caisse.dailyCheck.a11yOk', { time }) : text}>
      <View style={styles.row}>
        {icon}
        <Txt variant="secondary" color={status === 'WARNING' ? 'textPrimary' : 'textSecondary'} style={styles.flex}>{text}</Txt>
        <ChevronRight size={20} color={colors.iconSecondary} strokeWidth={2} />
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: size.touch, flexDirection: 'row', alignItems: 'center', gap: space.s2, paddingHorizontal: space.s4, paddingVertical: space.s2 },
  alert: { borderRadius: radius.group, marginHorizontal: space.s4, padding: space.s4, flexDirection: 'row', gap: space.s3 },
  alertBtn: { marginLeft: -space.s3 },
  flex: { flex: 1 },
});
