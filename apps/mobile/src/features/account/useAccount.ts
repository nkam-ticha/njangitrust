// The member's own account (spec R13, PRV-03): ask to change the payment number, ask to delete the
// account. Each returns a card; nothing changes until the member confirms it with their PIN
// (ActionCard). Writes are never retried automatically (queryClient).
import { useMutation } from '@tanstack/react-query';
import { selfSchema } from '@njangi/shared/contracts/me';
import { pendingActionCreatedSchema } from '@njangi/shared/contracts/pending-actions';
import { z } from 'zod';
import { api } from '@/api/client';
import { useSession } from '@/state/session';

const meResponseSchema = z.strictObject({ user: selfSchema });

/** A card that changes my own payment number (the operator is asked when it cannot be detected). */
export function useChangeNumberRequest() {
  return useMutation({
    mutationFn: async (input: { number: string; operator?: 'MTN' | 'ORANGE' }) =>
      (
        await api.post(
          '/v1/me/payment-number',
          { number: input.number, ...(input.operator ? { operator: input.operator } : {}) },
          { schema: pendingActionCreatedSchema },
        )
      ).action,
  });
}

/** A card that deletes my account. The server refuses, with the reason, while I still owe or hold money. */
export function useDeleteAccountRequest() {
  return useMutation({
    mutationFn: async () =>
      (await api.post('/v1/me/account-deletion', {}, { schema: pendingActionCreatedSchema }))
        .action,
  });
}

/** Reads the profile again (the new payment number) once the change is confirmed. */
export async function refreshSelf(): Promise<void> {
  const { user } = await api.get('/v1/me', { schema: meResponseSchema });
  useSession.getState().setUser(user);
}
