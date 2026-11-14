// PIN reset reviews (ACC-04, D8, D14): an admin, or two members when the person is an admin,
// confirm a request they can vouch for (an L2 card with their own PIN), or decline it. The account
// owner can cancel a pending request (D14).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pinResetRequestListSchema } from '@njangi/shared/contracts/auth';
import { pendingActionCreatedSchema } from '@njangi/shared/contracts/pending-actions';
import { api } from '@/api/client';

const key = (groupId: string) => ['group', groupId, 'pinResets'] as const;

export function usePinResetRequests(groupId: string | null) {
  return useQuery({
    queryKey: key(groupId ?? 'none'),
    enabled: !!groupId,
    queryFn: async () =>
      (await api.get(`/v1/groups/${groupId}/pin-resets`, { schema: pinResetRequestListSchema }))
        .requests,
  });
}

/** Prepares the PIN_RESET_APPROVE card (L2). */
export function useApprovePinReset(groupId: string | null) {
  return useMutation({
    mutationFn: async (resetId: string) =>
      (
        await api.post(
          `/v1/groups/${groupId}/pin-resets/${resetId}/approvals`,
          {},
          {
            schema: pendingActionCreatedSchema,
          },
        )
      ).action,
  });
}

export function useDeclinePinReset(groupId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (resetId: string) =>
      api.post(`/v1/groups/${groupId}/pin-resets/${resetId}/decline`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(groupId ?? 'none') }),
  });
}

/**
 * D14: the account owner cancels a pending reset of their own PIN.
 * Waiting for the API: the route below is the one proposed to the platform engineer.
 */
export function useCancelMyPinReset() {
  return useMutation({
    mutationFn: () => api.post('/v1/me/pin-reset/cancel', {}),
  });
}
