// Proposals and votes (R11, GOV-01..04). Creating a proposal and casting a vote both return a card
// to confirm (spec 4.5). `proposal.updated` keeps tallies live; secret votes carry participation only.
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pendingActionCreatedSchema } from '@njangi/shared/contracts/pending-actions';
import {
  proposalListSchema,
  type CastVoteRequest,
  type CreateProposalRequest,
  type ProposalDto,
} from '@njangi/shared/contracts/proposals';
import type { ProposalUpdatedPayload } from '@njangi/shared/contracts/realtime';
import { api } from '@/api/client';
import { withSocket } from '@/api/socket';
import { chatKeys } from '@/features/chat/useChat';
import { groupKeys } from '@/features/groups/useGroups';

const listKey = (groupId: string) => ['group', groupId, 'proposals'] as const;

/** Open votes are read every few seconds, so a result shows without a reload even when the realtime link is down. */
const POLL_OPEN_MS = 4000;
const POLL_IDLE_MS = 30_000;

/**
 * A vote closed: what it changed shows without a reload. A passed rule change, a member added or
 * removed and a new admin all change what other screens read; the result also reaches the bell and
 * the group chat (a system line).
 */
function refreshAfterClose(qc: ReturnType<typeof useQueryClient>, groupId: string): void {
  void qc.invalidateQueries({ queryKey: groupKeys.rules(groupId) });
  void qc.invalidateQueries({ queryKey: groupKeys.members(groupId) });
  void qc.invalidateQueries({ queryKey: groupKeys.overview(groupId) });
  void qc.invalidateQueries({ queryKey: groupKeys.mine });
  void qc.invalidateQueries({ queryKey: ['notifications'] });
  void qc.invalidateQueries({ queryKey: chatKeys.messages(groupId), exact: true });
}

export function useProposals(groupId: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: listKey(groupId ?? 'none'),
    enabled: !!groupId,
    networkMode: 'always',
    staleTime: 0,
    refetchIntervalInBackground: true,
    // Fast while a vote is open (a tally or a result can land at any moment), slow otherwise.
    refetchInterval: (q) =>
      q.state.data?.some((p) => p.status === 'OPEN') ? POLL_OPEN_MS : POLL_IDLE_MS,
    queryFn: async () => {
      const before = groupId ? qc.getQueryData<ProposalDto[]>(listKey(groupId)) : undefined;
      const { proposals } = await api.get(`/v1/groups/${groupId}/proposals`, {
        schema: proposalListSchema,
      });
      // The poll saw a vote close that the realtime link did not announce.
      const closed = before?.some(
        (old) =>
          old.status === 'OPEN' && proposals.some((p) => p.id === old.id && p.status !== 'OPEN'),
      );
      if (closed && groupId) refreshAfterClose(qc, groupId);
      return proposals;
    },
  });

  useEffect(() => {
    if (!groupId) return;
    // Waits for the realtime link when it is not up yet, and listens again after a reconnection.
    return withSocket((socket) => {
      socket.joinGroup(groupId);
      const onUpdate = (p: ProposalUpdatedPayload) => {
        if (p.groupId !== groupId) return;
        qc.setQueryData<ProposalDto[]>(listKey(groupId), (old) =>
          old?.map((x) =>
            x.id === p.id
              ? { ...x, status: p.status, participation: p.participation, tally: p.tally }
              : x,
          ),
        );
        // My own vote, the effect and closing times come with a fresh read.
        void qc.invalidateQueries({ queryKey: listKey(groupId) });
        if (p.status !== 'OPEN') refreshAfterClose(qc, groupId);
      };
      socket.on('proposal.updated', onUpdate);
      return () => {
        socket.off('proposal.updated', onUpdate);
        socket.leaveGroup(groupId);
      };
    });
  }, [groupId, qc]);

  return query;
}

/** Open votes waiting for this member: for the badge on the Votes tab. */
export function useVotesWaiting(groupId: string | null): number {
  const { data } = useProposals(groupId);
  return (data ?? []).filter((p) => p.status === 'OPEN' && p.canVote && !p.myVote).length;
}

export function useCreateProposal(groupId: string | null) {
  return useMutation({
    mutationFn: async (body: CreateProposalRequest) =>
      (
        await api.post(`/v1/groups/${groupId}/proposals`, body, {
          schema: pendingActionCreatedSchema,
        })
      ).action,
  });
}

export function useCastVote() {
  return useMutation({
    mutationFn: async ({ proposalId, choice }: { proposalId: string } & CastVoteRequest) =>
      (
        await api.post(
          `/v1/proposals/${proposalId}/votes`,
          { choice },
          { schema: pendingActionCreatedSchema },
        )
      ).action,
  });
}

export function useRefreshProposals(groupId: string | null) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: listKey(groupId ?? 'none') });
}
