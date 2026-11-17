// What the operator answered for a payment or a withdrawal (spec 2.6): the card shows the verb, this
// line shows the money. It polls GET /v1/payments/:id or /v1/withdrawals/:id until a final status, then
// syncs the card and the money figures. Nothing here starts a payment: the card did that.
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CircleAlert, CircleCheck, Clock } from 'lucide-react-native';
import { maskNumber, formatXAF } from '@njangi/shared';
import { Banner, useLang } from '@/ui';
import { usePayment, useWithdrawal, useRefreshMoney } from '@/features/money/queries';

interface MoneyFollowUpProps {
  kind: 'payment' | 'withdrawal';
  /** The id the confirmed card returned in `result.ref`; null until confirmed. */
  refId: string | null;
  /** The card's PendingAction id, to resync the card when the operator answers. */
  actionId: string;
  groupId: string | null;
  /** Operator of the member's number (MTN or ORANGE), for the failure copy. */
  operator: string;
  /** The member's own full number, for the withdrawal copy (shown as typed by the member). */
  ownNumber: string | null;
}

export function MoneyFollowUp(props: MoneyFollowUpProps) {
  if (!props.refId) return null;
  return <FollowUp {...props} refId={props.refId} />;
}

function FollowUp({
  kind,
  refId,
  actionId,
  groupId,
  operator,
  ownNumber,
}: MoneyFollowUpProps & { refId: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const refresh = useRefreshMoney(groupId);
  const payment = usePayment(kind === 'payment' ? refId : null);
  const withdrawal = useWithdrawal(kind === 'withdrawal' ? refId : null);
  const current = kind === 'payment' ? payment : withdrawal;
  const status = kind === 'payment' ? payment.data?.status : withdrawal.data?.status;
  const amount = kind === 'payment' ? payment.data?.amount : withdrawal.data?.amount;
  const final = status === 'SUCCESSFUL' || status === 'FAILED' || status === 'EXPIRED';

  // A final answer: the card and the money figures catch up with it.
  useEffect(() => {
    if (!final) return;
    void qc.invalidateQueries({ queryKey: ['pendingAction', actionId] });
    refresh();
  }, [final, actionId, qc, refresh]);

  if (amount === undefined || !status) {
    if (current.isError) {
      return <Banner kind="error" icon={CircleAlert} text={t('errors.generic.body')} />;
    }
    return <Banner kind="info" icon={Clock} text={t('confirmation.processing.generic')} />;
  }

  const money = formatXAF(amount, lang);
  const operatorName = t(`common.operators.${operator}` as 'common.operators.UNKNOWN');
  const reference = refId.slice(0, 8).toUpperCase();

  if (status === 'SUCCESSFUL') {
    const text =
      kind === 'payment'
        ? t('agent.results.paymentSuccess', { amount: money, ref: reference })
        : t('agent.results.withdrawalSuccess', {
            amount: money,
            number: ownNumber ? maskNumber(ownNumber) : '',
            ref: reference,
          });
    return <Banner kind="info" icon={CircleCheck} text={text} />;
  }
  if (status === 'FAILED' || status === 'EXPIRED') {
    const text =
      kind === 'withdrawal'
        ? t('agent.results.withdrawalFailed', { amount: money })
        : status === 'FAILED'
          ? t('agent.results.paymentFailed', { amount: money, operator: operatorName })
          : t('agent.results.paymentExpired', { amount: money, operator: operatorName });
    return <Banner kind="error" icon={CircleAlert} text={text} />;
  }
  return (
    <Banner
      kind="info"
      icon={Clock}
      text={
        kind === 'payment'
          ? t('confirmation.processing.payment', { operator: operatorName })
          : t('confirmation.processing.withdrawal', {
              number: ownNumber ? maskNumber(ownNumber) : '',
            })
      }
    />
  );
}
