// Money requests (spec 2.7, 4.5). Each one returns a PendingAction card; nothing moves until the
// member confirms it (ActionCard). Writes are never retried automatically (queryClient).
import { useMutation } from '@tanstack/react-query';
import { pendingActionCreatedSchema } from '@njangi/shared/contracts/pending-actions';
import {
  solidarityRequestSchema,
  type SolidarityRequestInput,
} from '@njangi/shared/contracts/solidarity';
import { api } from '@/api/client';

/** Pays the listed obligations (spec 2.6): a PAY card. */
export function usePayRequest(groupId: string | null) {
  return useMutation({
    mutationFn: async (obligationIds: string[]) =>
      (
        await api.post(
          `/v1/groups/${groupId}/payments`,
          { obligationIds },
          { schema: pendingActionCreatedSchema },
        )
      ).action,
  });
}

/** Withdraws an amount, or everything available ("ALL"): a WITHDRAW card. */
export function useWithdrawRequest(groupId: string | null) {
  return useMutation({
    mutationFn: async (amount: number | 'ALL') =>
      (
        await api.post(
          `/v1/groups/${groupId}/withdrawals`,
          { amount },
          { schema: pendingActionCreatedSchema },
        )
      ).action,
  });
}

/** Asks for solidarity support: opens a SOLIDARITY_PAYOUT vote after the member confirms (R10). */
export function useSolidarityRequest(groupId: string | null) {
  return useMutation({
    mutationFn: async (body: SolidarityRequestInput) =>
      (
        await api.post(
          `/v1/groups/${groupId}/solidarity-requests`,
          solidarityRequestSchema.parse(body),
          { schema: pendingActionCreatedSchema },
        )
      ).action,
  });
}
