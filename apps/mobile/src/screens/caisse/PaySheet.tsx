// Pay the open obligations of the member (spec 2.6, 4.5): the server prepares the card with the exact
// total and fees; the member confirms it; the operator's answer is followed until it is final.
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { maskNumber } from '@njangi/shared';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { space } from '@/theme';
import { Button, Txt, useLang } from '@/ui';
import { useConnectivity } from '@/state/connectivity';
import { usePayRequest } from '@/features/money/mutations';
import { errorMessage } from '@/features/errors/errorMessage';
import { ActionCard } from '../shared/ActionCard';
import { MoneyFollowUp } from './MoneyFollowUp';

interface PaySheetProps {
  groupId: string | null;
  obligationIds: string[];
  /** Operator of the member's payment number, as the operator code (MTN, ORANGE). */
  operator: string;
  /** The member's own full number (never shown to others). */
  ownNumber: string | null;
  /** The payment was confirmed: the money figures refresh. */
  onPaid: () => void;
  onDone: () => void;
}

export function PaySheet({
  groupId,
  obligationIds,
  operator,
  ownNumber,
  onPaid,
  onDone,
}: PaySheetProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const online = useConnectivity((s) => s.online);
  const request = usePayRequest(groupId);
  const [action, setAction] = useState<PendingActionDto | null>(null);
  const [paymentRef, setPaymentRef] = useState<string | null>(null);
  const operatorName = t(`common.operators.${operator}` as 'common.operators.UNKNOWN');

  if (!action) {
    return (
      <View style={{ gap: space.s4 }}>
        <Txt color="textSecondary">{t('caisse.tour.youPayHelp')}</Txt>
        {request.error ? (
          <Txt variant="secondary" color="textDanger">
            {errorMessage(request.error, t, lang)}
          </Txt>
        ) : null}
        <Button
          fullWidth
          label={t('common.actions.continue')}
          loading={request.isPending}
          offline={!online}
          disabled={obligationIds.length === 0 || request.isPending}
          onPress={() =>
            request.mutate(obligationIds, {
              onSuccess: (prepared) => setAction(prepared),
            })
          }
        />
      </View>
    );
  }

  return (
    <View style={{ gap: space.s4 }}>
      <ActionCard
        action={action}
        operator={operatorName}
        maskedNumber={ownNumber ? maskNumber(ownNumber) : undefined}
        onConfirmed={(_data, confirmed) => {
          setPaymentRef(confirmed?.result?.ref ?? null);
          onPaid();
        }}
        onCancelled={() => setAction(null)}
        onRetry={() => setAction(null)}
        onClose={onDone}
      />
      <MoneyFollowUp
        kind="payment"
        refId={paymentRef}
        actionId={action.id}
        groupId={groupId}
        operator={operator}
        ownNumber={ownNumber}
      />
    </View>
  );
}
