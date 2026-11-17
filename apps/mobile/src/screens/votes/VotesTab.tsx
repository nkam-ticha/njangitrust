// S-18 Votes tab (SCREENS.md; R11, GOV-01..04): open proposals first, then closed ones. "Oui" or
// "Non" prepares the vote card; the card is confirmed in a sheet (spec 4.5). Secret votes show
// participation only until they close.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert, Vote } from 'lucide-react-native';
import { pick } from '@njangi/shared';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import type { ProposalDto } from '@njangi/shared/contracts/proposals';
import { useConnectivity } from '@/state/connectivity';
import { space } from '@/theme';
import {
  BottomSheet,
  EmptyState,
  ProposalCard,
  SectionHeader,
  SkeletonRows,
  Txt,
  useLang,
} from '@/ui';
import { useActiveGroup } from '@/features/groups/useGroups';
import { useCastVote, useProposals, useRefreshProposals } from '@/features/proposals/useProposals';
import { errorMessage } from '@/features/errors/errorMessage';
import { ActionCard } from '../shared/ActionCard';
import { TabScreen } from '../shell/TabScreen';
import { proposalCardProps } from './proposalCardProps';

export function VotesTab() {
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const online = useConnectivity((s) => s.online);
  const { group, loading } = useActiveGroup();
  const groupId = group?.groupId ?? null;
  const proposals = useProposals(groupId);
  const refresh = useRefreshProposals(groupId);
  const vote = useCastVote();
  const [now] = useState(() => Date.now());
  const [voting, setVoting] = useState<{ proposal: ProposalDto; action: PendingActionDto } | null>(
    null,
  );

  // The groups are still loading: a skeleton, not "no group yet".
  if (!group && loading) {
    return (
      <TabScreen>
        <SkeletonRows rows={4} />
      </TabScreen>
    );
  }
  if (!group) {
    return (
      <TabScreen>
        <EmptyState icon={Vote} title={t('votes.title')} body={t('emptyStates.noGroup.body')} />
      </TabScreen>
    );
  }

  // D19: proposals exist only once the first cycle has started; before that the admin sets up the
  // group directly.
  if (group.status === 'FORMING') {
    const admin = group.role === 'ADMIN';
    return (
      <TabScreen>
        <EmptyState
          icon={Vote}
          title={t('votes.beforeCycleTitle')}
          body={admin ? t('votes.beforeCycleBodyAdmin') : t('votes.beforeCycleBodyMember')}
          actionLabel={admin ? t('invite.founding.title') : undefined}
          onAction={admin ? () => router.push('/founding') : undefined}
        />
      </TabScreen>
    );
  }

  const list = proposals.data ?? [];
  const open = list
    .filter((p) => p.status === 'OPEN')
    .sort(
      (a, b) => Number(!!a.myVote) - Number(!!b.myVote) || a.closesAt.localeCompare(b.closesAt),
    );
  const closed = list
    .filter((p) => p.status !== 'OPEN')
    .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''));
  const ctx = { lang, t, now, myMembershipId: group.membershipId };
  const cast = (proposal: ProposalDto, choice: 'YES' | 'NO') =>
    vote.mutate(
      { proposalId: proposal.id, choice },
      { onSuccess: (action) => setVoting({ proposal, action }) },
    );
  const card = (p: ProposalDto) => (
    <ProposalCard
      key={p.id}
      {...proposalCardProps(p, ctx)}
      offline={!online}
      onYes={() => cast(p, 'YES')}
      onNo={() => cast(p, 'NO')}
    />
  );

  return (
    <TabScreen>
      <SectionHeader
        title={`${t('votes.open')} (${open.length})`}
        actionLabel={t('votes.propose')}
        onAction={() => router.push('/new-proposal')}
      />
      {proposals.isPending ? <SkeletonRows rows={3} /> : null}
      {proposals.isError ? (
        <EmptyState
          icon={CircleAlert}
          title={t('emptyStates.loadFailed.title')}
          body={errorMessage(proposals.error, t, lang)}
          actionLabel={t('common.actions.retry')}
          onAction={() => void proposals.refetch()}
        />
      ) : null}
      {vote.error ? (
        <Txt variant="secondary" color="textDanger">
          {errorMessage(vote.error, t, lang)}
        </Txt>
      ) : null}
      {proposals.isSuccess && !open.length ? (
        <EmptyState icon={Vote} title={t('votes.title')} body={t('votes.emptyOpen')} />
      ) : null}
      <View style={styles.list}>{open.map(card)}</View>
      {closed.length ? (
        <>
          <SectionHeader title={t('votes.closed')} />
          <View style={styles.list}>{closed.map(card)}</View>
        </>
      ) : null}

      <BottomSheet
        visible={!!voting}
        onClose={() => setVoting(null)}
        title={voting ? pick(voting.proposal.title, lang) : ''}
      >
        {voting ? (
          <ActionCard
            action={voting.action}
            onConfirmed={() => {
              void refresh();
              setVoting(null);
            }}
            onCancelled={() => setVoting(null)}
            onClose={() => setVoting(null)}
          />
        ) : null}
      </BottomSheet>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.s4 },
});
