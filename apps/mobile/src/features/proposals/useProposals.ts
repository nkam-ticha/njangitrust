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
import { getSocket } from '@/api/socket';

const listKey = (groupId: string) => ['group', groupId, 'proposals'] as const;

export function useProposals(groupId: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: listKey(groupId ?? 'none'),
    enabled: !!groupId,
    queryFn: async () =>
      (await api.get(`/v1/groups/${groupId}/proposals`, { schema: proposalListSchema })).proposals,
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !groupId) return;
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
    };
    socket.on('proposal.updated', onUpdate);
    return () => {
      socket.off('proposal.updated', onUpdate);
    };
  }, [groupId, qc]);

  return query;
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
