// Bidding (enchère, R8, spec 2.7 Bids): the sealed bid is a PendingAction (PLACE_BID) the member
// confirms; the list stays hidden until the bidding closes (the API returns `bids: null` before).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { bilingualSchema, instantSchema, uuidSchema } from '@njangi/shared/contracts/common';
import { pendingActionCreatedSchema } from '@njangi/shared/contracts/pending-actions';
import { api } from '@/api/client';
import { fcfaSchema } from '@njangi/shared/contracts/common';

export const bidsSchema = z.object({
  round: z.number().int(),
  closesAt: bilingualSchema,
  count: z.number().int(),
  mine: z
    .object({ amount: fcfaSchema, placedAt: instantSchema, updatedAt: instantSchema })
    .nullable(),
  winnerMembershipId: uuidSchema.nullable(),
  bids: z
    .array(
      z.object({
        membershipId: uuidSchema,
        name: z.string(),
        amount: fcfaSchema,
        reachedAt: instantSchema,
      }),
    )
    .nullable(),
});
export type BidsDto = z.infer<typeof bidsSchema>;

export function useBids(groupId: string | null, roundId: string | null) {
  return useQuery({
    queryKey: ['group', groupId ?? 'none', 'bids', roundId ?? 'none'],
    enabled: !!groupId && !!roundId,
    queryFn: () => api.get(`/v1/groups/${groupId}/rounds/${roundId}/bids`, { schema: bidsSchema }),
  });
}

export function usePlaceBid(groupId: string | null, roundId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (amount: number) =>
      (
        await api.post(
          `/v1/groups/${groupId}/rounds/${roundId}/bids`,
          { amount },
          { schema: pendingActionCreatedSchema },
        )
      ).action,
    onSettled: () => void qc.invalidateQueries({ queryKey: ['group', groupId ?? 'none', 'bids'] }),
  });
}
