// Withdraw money to the member's own number (spec 2.6, R5.4, 4.5). The member types an amount or takes
// everything available ("ALL"); the server prepares the card with the fee and checks the rules. The
// money leaves only when the member confirms, and the operator's answer is then followed.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { maskNumber, formatXAF } from '@njangi/shared';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { space } from '@/theme';
import { AmountInput, AmountText, Button, Txt, useLang } from '@/ui';
import { useConnectivity } from '@/state/connectivity';
import { useWithdrawRequest } from '@/features/money/mutations';
import { errorMessage } from '@/features/errors/errorMessage';
import { ActionCard } from '../shared/ActionCard';
import { MoneyFollowUp } from './MoneyFollowUp';

interface WithdrawSheetProps {
  groupId: string | null;
  /** What the member can withdraw now (the server's figure). */
  available: number;
  ownNumber: string | null;
  operator: string;
  onWithdrawn: () => void;
  onDone: () => void;
}

export function WithdrawSheet({
  groupId,
  available,
  ownNumber,
  operator,
  onWithdrawn,
  onDone,
}: WithdrawSheetProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const online = useConnectivity((s) => s.online);
  const request = useWithdrawRequest(groupId);
  const [amount, setAmount] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const [action, setAction] = useState<PendingActionDto | null>(null);
  const [withdrawalRef, setWithdrawalRef] = useState<string | null>(null);

  const submitted = all ? 'ALL' : amount;
  const canSubmit = submitted !== null && available > 0;
  const operatorName = t(`common.operators.${operator}` as 'common.operators.UNKNOWN');

  if (!action) {
    return (
      <View style={styles.wrap}>
        <AmountText amount={available} size="large" align="left" />
        <Txt variant="secondary" color="textSecondary">
          {t('withdraw.partialNote')}
        </Txt>
        <AmountInput
          label={t('withdraw.amountLabel')}
          value={all ? available : amount}
          onChange={(value) => {
            setAll(false);
            setAmount(value);
          }}
          max={available}
          helper={t('withdraw.max', { amount: formatXAF(available, lang) })}
        />
        {ownNumber ? (
          <Txt variant="secondary" color="textSecondary">
            {t('withdraw.to', { operator: operatorName, number: maskNumber(ownNumber) })}
          </Txt>
        ) : null}
        {request.error ? (
          <Txt variant="secondary" color="textDanger">
            {errorMessage(request.error, t, lang)}
          </Txt>
        ) : null}
        <View style={styles.actions}>
          <Button
            variant="secondary"
            label={t('withdraw.all')}
            disabled={available <= 0}
            onPress={() => setAll(true)}
          />
          <Button
            fullWidth
            label={t('withdraw.prepare')}
            loading={request.isPending}
            offline={!online}
            disabled={!canSubmit || request.isPending}
            onPress={() => {
              if (submitted === null) return;
              request.mutate(submitted, { onSuccess: (prepared) => setAction(prepared) });
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ActionCard
        action={action}
        onConfirmed={(_data, confirmed) => {
          setWithdrawalRef(confirmed?.result?.ref ?? null);
          onWithdrawn();
        }}
        onCancelled={() => setAction(null)}
        onRetry={() => setAction(null)}
        onClose={onDone}
      />
      <MoneyFollowUp
        kind="withdrawal"
        refId={withdrawalRef}
        actionId={action.id}
        groupId={groupId}
        operator={operator}
        ownNumber={ownNumber}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.s4 },
  actions: { gap: space.s2 },
});
