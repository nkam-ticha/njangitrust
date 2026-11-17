// The payout breakdown of a round (spec 2.7, CAI-03, FEE-03): gross contributions, fees, automatic
// deductions, what was withdrawn and what remains. Every line is the server's figure.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDateTime, formatXAF } from '@njangi/shared';
import { space } from '@/theme';
import { AmountText, Banner, GroupedList, ListRow, SkeletonRows, Txt, useLang } from '@/ui';
import { usePayoutBreakdown } from '@/features/money/queries';
import { errorMessage } from '@/features/errors/errorMessage';

interface BreakdownSheetProps {
  groupId: string | null;
  roundNumber: number;
}

export function BreakdownSheet({ groupId, roundNumber }: BreakdownSheetProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const query = usePayoutBreakdown(groupId, roundNumber);

  if (query.isPending) return <SkeletonRows rows={4} />;
  if (query.isError) {
    return <Banner kind="error" text={errorMessage(query.error, t, lang)} />;
  }
  const { breakdown, payoutAt, debtsDue } = query.data;
  const deductionLabel = (kind: string) => {
    if (kind === 'FINE') return t('caisse.breakdown.deductionFine', { round: roundNumber });
    if (kind === 'BID') return t('caisse.breakdown.deductionBid');
    if (kind === 'LOAN_INSTALLMENT') return t('caisse.breakdown.deductionLoan');
    return t('caisse.breakdown.deductionOther');
  };

  return (
    <View style={styles.column}>
      <Txt variant="secondary" color="textSecondary">
        {formatDateTime(payoutAt, lang)}
      </Txt>
      <View style={styles.flush}>
        <GroupedList>
          <ListRow
            titleWeight="regular"
            title={t('caisse.breakdown.gross')}
            trailing={<AmountText amount={breakdown.collected} size="small" sign="always" />}
          />
          <ListRow
            titleWeight="regular"
            title={t('caisse.breakdown.fees')}
            trailing={<AmountText amount={breakdown.collectionFees} size="small" />}
          />
          {breakdown.deductions.map((d, i) => (
            <ListRow
              key={`${d.kind}-${i}`}
              titleWeight="regular"
              title={deductionLabel(d.kind)}
              trailing={<AmountText amount={d.amount} size="small" />}
            />
          ))}
          <ListRow
            titleWeight="regular"
            title={t('caisse.breakdown.withdrawn')}
            trailing={<AmountText amount={breakdown.withdrawn} size="small" />}
          />
          <ListRow
            titleWeight="regular"
            title={t('caisse.breakdown.remaining')}
            trailing={<AmountText amount={breakdown.remaining} size="small" />}
          />
        </GroupedList>
      </View>
      {breakdown.nextWithdrawal ? (
        <Txt color="textSecondary">
          {t('withdraw.max', { amount: formatXAF(breakdown.nextWithdrawal.maxAmount, lang) })}
        </Txt>
      ) : null}
      {debtsDue > 0 ? (
        <Txt color="textSecondary">
          {t('common.labelOnly', { label: t('moi.debts') })}{' '}
          <AmountText amount={debtsDue} size="small" />
        </Txt>
      ) : null}
      <Txt variant="secondary" color="textSecondary">
        {t('caisse.breakdown.feeNote')}
      </Txt>
      <Txt variant="secondary" color="textSecondary">
        {t('caisse.breakdown.autoSettlementNote')}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.s3 },
  flush: { marginHorizontal: -space.s4 },
});
