// Caisse, Tour segment (SCREENS.md S-12; spec 1.4, R2, R5): the round in progress, who has paid, what
// I owe and my money, with the pay and withdraw sheets. The ring is not drawn yet: the round DTO has
// no target amount, and the ring needs one (see the report).
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert, Wallet } from 'lucide-react-native';
import { formatDateShort, formatDateTime } from '@njangi/shared';
import type { MyGroupDto } from '@njangi/shared/contracts/me';
import { space } from '@/theme';
import {
  AmountText,
  BottomSheet,
  Button,
  EmptyState,
  GroupedList,
  ListRow,
  NjangiRing,
  SectionHeader,
  SkeletonRows,
  Txt,
  useLang,
} from '@/ui';
import type { RingMember } from '@/ui';
import { useSession } from '@/state/session';
import { useMembers } from '@/features/groups/useGroups';
import {
  useCurrentRound,
  useMyDues,
  useMyMoney,
  useRefreshMoney,
  useRotation,
} from '@/features/money/queries';
import { useCycles } from '@/features/cycles/queries';
import { errorMessage } from '@/features/errors/errorMessage';
import { BiddingPanel } from '../bids/BiddingPanel';
import { BetweenCyclesPanel } from './BetweenCyclesPanel';
import { BreakdownSheet } from './BreakdownSheet';
import { MyMoney } from './MyMoney';
import { PaySheet } from './PaySheet';
import { PreviousRoundsPicker } from './PreviousRoundsPicker';
import { WithdrawBottomSheet } from './WithdrawSheet';

type Sheet = 'pay' | 'withdraw' | 'breakdown' | null;

export function TourSection({ group }: { group: MyGroupDto }) {
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const groupId = group.groupId;
  const round = useCurrentRound(groupId);
  const cycles = useCycles(groupId);
  const members = useMembers(groupId);
  const money = useMyMoney(groupId);
  const dues = useMyDues(groupId);
  const rotation = useRotation(groupId, round.data?.totalRounds ?? 0);
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
  if (!current && cycles.data?.phase === 'BETWEEN_CYCLES') {
    // Between two cycles (D40.2): the last cycle's result, and the admin's way to start the next.
    return <BetweenCyclesPanel group={group} withMoney />;
  }
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

  // The ring shows the cycle's order (the server's rounds, one per member); before the order is read
  // or in bidding mode (beneficiaries not all known) it shows the active members.
  const names = new Map(list.map((m) => [m.membershipId, m.name]));
  const known = rotation.rounds.filter((r) => r.beneficiaryMembershipId);
  const orderKnown = known.length > 0 && known.length === (current.totalRounds ?? -1);
  const ringIds = orderKnown
    ? known.map((r) => r.beneficiaryMembershipId as string)
    : list.filter((m) => m.status === 'ACTIVE').map((m) => m.membershipId);
  const served = new Set(
    known.filter((r) => r.number < current.number).map((r) => r.beneficiaryMembershipId),
  );
  const ringMembers: RingMember[] = ringIds.map((id) => ({
    membershipId: id,
    name: names.get(id) ?? '',
    state: unpaid.has(id) ? (late ? 'late' : 'unpaid') : 'paid',
    isBeneficiary: id === current.beneficiaryMembershipId,
    served: served.has(id),
  }));
  const upcoming = known.filter((r) => r.number > current.number && r.beneficiaryName);

  return (
    <View style={styles.column}>
      <View style={styles.head}>
        <Txt variant="sectionTitle">
          {t('common.roundOf', {
            round: current.number,
            total: current.totalRounds ?? current.contributionCount,
          })}
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

      {current.target !== undefined && ringMembers.length > 0 ? (
        <View style={styles.ring}>
          <NjangiRing
            size="large"
            members={ringMembers}
            collected={current.collected}
            target={current.target}
            round={current.number}
            roundsTotal={current.totalRounds ?? ringMembers.length}
            meId={group.membershipId}
          />
        </View>
      ) : null}

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

      {upcoming.length ? (
        <>
          <SectionHeader inset={false} title={t('caisse.tour.upcomingRounds')} />
          <View style={styles.flush}>
            <GroupedList>
              {upcoming.map((r) => (
                <ListRow
                  key={r.id}
                  title={t('caisse.tour.upcomingRow', {
                    round: r.number,
                    name:
                      r.beneficiaryMembershipId === group.membershipId
                        ? t('common.youSuffix', { name: r.beneficiaryName ?? '' })
                        : (r.beneficiaryName ?? ''),
                  })}
                  subtitle={formatDateShort(r.payoutAt, lang)}
                />
              ))}
            </GroupedList>
          </View>
        </>
      ) : null}

      <PreviousRoundsPicker group={group} currentNumber={current.number} />

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

      <BottomSheet
        visible={sheet === 'breakdown'}
        onClose={close}
        title={t('caisse.breakdown.title', { round: current.number })}
      >
        {sheet === 'breakdown' ? (
          <BreakdownSheet
            groupId={groupId}
            roundNumber={current.number}
            forBeneficiary={beneficiaryIsMe}
          />
        ) : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.s4 },
  head: { gap: space.s1 },
  ring: { alignItems: 'center' },
  flush: { marginHorizontal: -space.s4 },
});
