// Caisse, Tour segment (SCREENS.md S-12; spec 1.4, R2, R5): the round in progress, who has paid, what
// I owe and my money, with the pay and withdraw sheets. The ring is not drawn yet: the round DTO has
// no target amount, and the ring needs one (see the report).
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert, Wallet } from 'lucide-react-native';
import { formatDateTime } from '@njangi/shared';
import type { MyGroupDto } from '@njangi/shared/contracts/me';
import { space } from '@/theme';
import {
  AmountText,
  BottomSheet,
  Button,
  EmptyState,
  GroupedList,
  ListRow,
  SectionHeader,
  SkeletonRows,
  Txt,
  useLang,
} from '@/ui';
import { useSession } from '@/state/session';
import { useMembers } from '@/features/groups/useGroups';
import { useCurrentRound, useMyDues, useMyMoney, useRefreshMoney } from '@/features/money/queries';
import { errorMessage } from '@/features/errors/errorMessage';
import { BiddingPanel } from '../bids/BiddingPanel';
import { BreakdownSheet } from './BreakdownSheet';
import { MyMoney } from './MyMoney';
import { PaySheet } from './PaySheet';
import { WithdrawSheet } from './WithdrawSheet';

type Sheet = 'pay' | 'withdraw' | 'breakdown' | null;

export function TourSection({ group }: { group: MyGroupDto }) {
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const groupId = group.groupId;
  const round = useCurrentRound(groupId);
  const members = useMembers(groupId);
  const money = useMyMoney(groupId);
  const dues = useMyDues(groupId);
  const user = useSession((s) => s.user);
  const refresh = useRefreshMoney(groupId);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [now] = useState(() => Date.now());

  const admin = group.role === 'ADMIN';
  const forming = group.status === 'FORMING';
  const list = members.data ?? [];
  const operator = user?.paymentNumber?.operator ?? 'UNKNOWN';
  const ownNumber = user?.paymentNumber?.number ?? null;

  if (round.isPending || members.isPending) return <SkeletonRows rows={4} />;
  if (round.isError) {
    return (
      <EmptyState
        icon={CircleAlert}
        title={t('emptyStates.loadFailed.title')}
        body={errorMessage(round.error, t, lang)}
        actionLabel={t('common.actions.retry')}
        onAction={() => void round.refetch()}
      />
    );
  }
  const current = round.data;
  if (!current) {
    return (
      <EmptyState
        icon={Wallet}
        title={t('caisse.segments.tour')}
        body={forming && admin ? t('caisse.tour.noCycleAdmin') : t('caisse.tour.noCycle')}
        actionLabel={forming && admin ? t('invite.founding.add') : undefined}
        onAction={forming && admin ? () => router.push('/founding') : undefined}
      />
    );
  }

  const unpaid = new Set(current.unpaidMembershipIds);
  const late = now > Date.parse(current.dueAt);
  const payoutAt = formatDateTime(current.payoutAt, lang);
  const beneficiaryIsMe = current.beneficiaryMembershipId === group.membershipId;
  const paidMembers = list.filter((m) => m.status === 'ACTIVE' && !unpaid.has(m.membershipId));
  const unpaidMembers = list.filter((m) => unpaid.has(m.membershipId));
  const obligationIds = (dues.data ?? []).map((d) => d.id);
  const close = () => setSheet(null);

  return (
    <View style={styles.column}>
      <View style={styles.head}>
        <Txt variant="sectionTitle">
          {t('common.roundOf', { round: current.number, total: current.contributionCount })}
        </Txt>
        <Txt color="textSecondary">
          {beneficiaryIsMe
            ? t('caisse.tour.beneficiaryYou', { date: payoutAt })
            : t('caisse.tour.beneficiary', { name: current.beneficiaryName ?? '', date: payoutAt })}
        </Txt>
        <Txt variant="secondary" color="textSecondary">
          {late
            ? t('caisse.tour.deadlinePassed', { date: formatDateTime(current.dueAt, lang) })
            : t('caisse.tour.deadline', { date: formatDateTime(current.dueAt, lang) })}
        </Txt>
      </View>

      {current.mode === 'BIDDING' ? (
        <BiddingPanel groupId={groupId} roundId={current.id} roundNumber={current.number} />
      ) : null}

      <MyMoney
        money={money}
        dues={dues}
        operator={operator}
        onPay={() => setSheet('pay')}
        onWithdraw={() => setSheet('withdraw')}
      />

      {unpaidMembers.length ? (
        <>
          <SectionHeader
            inset={false}
            title={t('caisse.tour.unpaidSection', { count: unpaidMembers.length })}
          />
          <View style={styles.flush}>
            <GroupedList>
              {unpaidMembers.map((m) => (
                <ListRow
                  key={m.membershipId}
                  title={m.isMe ? t('common.youSuffix', { name: m.name }) : m.name}
                  trailing={
                    current.contributionAmount !== null ? (
                      <AmountText amount={current.contributionAmount} size="small" />
                    ) : undefined
                  }
                  trailingNote={
                    <Txt variant="secondary" color={late ? 'textDanger' : 'textSecondary'}>
                      {late ? t('caisse.tour.late') : t('caisse.tour.pending')}
                    </Txt>
                  }
                />
              ))}
            </GroupedList>
          </View>
        </>
      ) : null}

      <SectionHeader
        inset={false}
        title={t('caisse.tour.paidSection', { count: paidMembers.length })}
      />
      <View style={styles.flush}>
        <GroupedList>
          {paidMembers.map((m) => (
            <ListRow
              key={m.membershipId}
              title={m.isMe ? t('common.youSuffix', { name: m.name }) : m.name}
            />
          ))}
        </GroupedList>
      </View>
      {!unpaidMembers.length && paidMembers.length ? (
        <Txt color="textSecondary">{t('caisse.tour.allPaid')}</Txt>
      ) : null}

      <Button
        variant="secondary"
        fullWidth
        label={t('caisse.tour.breakdown')}
        onPress={() => setSheet('breakdown')}
      />

      <BottomSheet visible={sheet === 'pay'} onClose={close} title={t('agent.chips.pay')}>
        {sheet === 'pay' ? (
          <PaySheet
            groupId={groupId}
            obligationIds={obligationIds}
            operator={operator}
            ownNumber={ownNumber}
            onPaid={refresh}
            onDone={close}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'withdraw'}
        onClose={close}
        title={t('withdraw.titleGeneric')}
      >
        {sheet === 'withdraw' && money.data ? (
          <WithdrawSheet
            groupId={groupId}
            available={money.data.available}
            ownNumber={ownNumber}
            operator={operator}
            onWithdrawn={refresh}
            onDone={close}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'breakdown'}
        onClose={close}
        title={t('caisse.breakdown.title', { round: current.number })}
      >
        {sheet === 'breakdown' ? (
          <BreakdownSheet groupId={groupId} roundNumber={current.number} />
        ) : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.s4 },
  head: { gap: space.s1 },
  flush: { marginHorizontal: -space.s4 },
});
