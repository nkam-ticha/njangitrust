// Caisse, between two cycles: the member's own money (what can be withdrawn, what is carried over and
// can still be paid), with the same pay and withdraw sheets as the Tour. Shown only when there is
// something to withdraw, hold or pay.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MyGroupDto } from '@njangi/shared/contracts/me';
import { BottomSheet } from '@/ui';
import { useSession } from '@/state/session';
import { useMyDues, useMyMoney, useRefreshMoney } from '@/features/money/queries';
import { showMoneyBetweenCycles } from './moneyBetweenCycles';
import { MyMoney } from './MyMoney';
import { PaySheet } from './PaySheet';
import { WithdrawBottomSheet } from './WithdrawSheet';

type Sheet = 'pay' | 'withdraw' | null;

export function BetweenCyclesMoney({ group }: { group: MyGroupDto }) {
  const { t } = useTranslation();
  const groupId = group.groupId;
  const money = useMyMoney(groupId);
  const dues = useMyDues(groupId);
  const user = useSession((s) => s.user);
  const refresh = useRefreshMoney(groupId);
  const [sheet, setSheet] = useState<Sheet>(null);
  const operator = user?.paymentNumber?.operator ?? 'UNKNOWN';
  const ownNumber = user?.paymentNumber?.number ?? null;
  const close = () => setSheet(null);

  if (!showMoneyBetweenCycles(money.data, (dues.data ?? []).length)) return null;
  return (
    <>
      <MyMoney
        money={money}
        dues={dues}
        operator={operator}
        onPay={() => setSheet('pay')}
        onWithdraw={() => setSheet('withdraw')}
      />
      <BottomSheet visible={sheet === 'pay'} onClose={close} title={t('agent.chips.pay')}>
        {sheet === 'pay' ? (
          <PaySheet
            groupId={groupId}
            obligationIds={(dues.data ?? []).map((d) => d.id)}
            operator={operator}
            ownNumber={ownNumber}
            onPaid={refresh}
            onDone={close}
          />
        ) : null}
      </BottomSheet>
      {money.data ? (
        <WithdrawBottomSheet
          visible={sheet === 'withdraw'}
          onClose={close}
          groupId={groupId}
          available={money.data.available}
          ownNumber={ownNumber}
          operator={operator}
          onWithdrawn={refresh}
          onDone={close}
        />
      ) : null}
    </>
  );
}
