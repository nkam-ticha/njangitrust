// Withdraw money to the member's own number (spec 2.6, R5.4, 4.5). The member types an amount or takes
// everything available ("ALL"); the server prepares the card with the fee and checks the rules. The
// money leaves only when the member confirms, and the operator's answer is then followed.
// The primary button sits in the sheet's sticky footer, so it never falls below the fold (#88), and
// the sheet's own title is not repeated by the card's title.
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { maskNumber, formatXAF } from '@njangi/shared';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { space } from '@/theme';
import { AmountInput, AmountText, BottomSheet, Button, Txt, useLang } from '@/ui';
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

interface WithdrawFlow {
  /** The step the sheet is in: choosing an amount, or confirming the prepared card. */
  step: 'amount' | 'confirm';
  body: ReactNode;
  /** Back to the amount step with nothing typed (the sheet was closed and opens again). */
  reset: () => void;
  /** Forgets an error of the last attempt (called when the sheet closes). */
  clearError: () => void;
  /** The primary button of the amount step; null once the card is shown (it has its own buttons). */
  footer: ReactNode;
}

/** The two steps of a withdrawal as pieces a sheet lays out: the body, and the sticky button. */
function useWithdrawFlow({
  groupId,
  available,
  ownNumber,
  operator,
  onWithdrawn,
  onDone,
}: WithdrawSheetProps): WithdrawFlow {
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

  const reset = () => {
    setAmount(null);
    setAll(false);
    setAction(null);
    setWithdrawalRef(null);
  };

  if (action) {
    return {
      step: 'confirm',
      reset,
      clearError: request.reset,
      footer: null,
      body: (
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
      ),
    };
  }

  return {
    step: 'amount',
    reset,
    clearError: request.reset,
    body: (
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
        <Button
          variant="secondary"
          fullWidth
          label={t('withdraw.all')}
          disabled={available <= 0}
          onPress={() => setAll(true)}
        />
        {ownNumber ? (
          <Txt variant="secondary" color="textSecondary">
            {t('withdraw.to', { operator: operatorName, number: maskNumber(ownNumber) })}
          </Txt>
        ) : null}
        {request.error ? (
          <Txt variant="secondary" color="textDanger" accessibilityLiveRegion="polite">
            {errorMessage(request.error, t, lang)}
          </Txt>
        ) : null}
      </View>
    ),
    footer: (
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
    ),
  };
}

interface WithdrawBottomSheetProps extends WithdrawSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * The withdraw sheet with its primary button pinned above the gesture bar. The card of the second
 * step has its own title, so the sheet's title changes there instead of repeating it.
 */
export function WithdrawBottomSheet({ visible, onClose, ...flowProps }: WithdrawBottomSheetProps) {
  const { t } = useTranslation();
  const flow = useWithdrawFlow(flowProps);
  // Each opening starts from the amount step (state adjusted during render, not in an effect).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) flow.reset();
  }
  const close = () => {
    flow.clearError();
    onClose();
  };
  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={flow.step === 'confirm' ? t('withdraw.reviewTitle') : t('withdraw.titleGeneric')}
      footer={flow.footer}
    >
      {flow.body}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.s4 },
});
