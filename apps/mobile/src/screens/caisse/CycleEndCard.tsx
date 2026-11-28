// Caisse: the result of the last closed cycle for the caller (R9.3, D40): their share of the general
// fund, or why they had none, and what stays in the fund. Figures are the server's (ledger event).
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatXAF } from '@njangi/shared';
import { space } from '@/theme';
import { SkeletonRows, Txt, useLang } from '@/ui';
import { useCycleSummary } from '@/features/cycles/queries';

export function CycleEndCard({ groupId, cycleNumber }: { groupId: string; cycleNumber: number }) {
  const { t } = useTranslation();
  const lang = useLang();
  const summary = useCycleSummary(groupId, cycleNumber);
  if (summary.isPending) return <SkeletonRows rows={2} />;
  const data = summary.data;
  if (!data?.fund || !data.mine) return null;
  const { fund, mine } = data;
  const own =
    mine.outcome === 'SHARE'
      ? t('caisse.cycleEnd.share', { amount: formatXAF(mine.share, lang) })
      : mine.outcome === 'DEBT'
        ? t('caisse.cycleEnd.debt')
        : mine.outcome === 'NOT_IN_CYCLE'
          ? t('caisse.cycleEnd.notInCycle')
          : t('caisse.cycleEnd.none');
  return (
    <View style={styles.card} accessible>
      <Txt variant="sectionTitle" accessibilityRole="header">
        {`${t('caisse.cycleEnd.title')} ${data.number}`}
      </Txt>
      <Txt>{own}</Txt>
      {mine.leftAtEnd ? <Txt color="textSecondary">{t('caisse.cycleEnd.left')}</Txt> : null}
      {fund.remainder > 0 ? (
        <Txt variant="secondary" color="textSecondary">
          {t('caisse.cycleEnd.remainder', { amount: formatXAF(fund.remainder, lang) })}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ card: { gap: space.s1, paddingVertical: space.s2 } });
