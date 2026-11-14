// PendingAction lifecycle (spec 4.5): the server prepares the card, the member confirms or cancels
// it here, and `pendingAction.updated` moves it to processing, done or failed. The agent is never
// involved in confirming.
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { PendingActionUpdatedPayload } from '@njangi/shared/contracts/realtime';
import {
  confirmActionResponseSchema,
  pendingActionResponseSchema,
  type PendingActionDto,
} from '@njangi/shared/contracts/pending-actions';
import { api } from '@/api/client';
import { getSocket } from '@/api/socket';

const key = (id: string) => ['pendingAction', id] as const;
const resultData = z.record(z.string(), z.unknown()).nullable();

export interface UsePendingAction {
  action: PendingActionDto;
  /** Result data returned once by the confirmation (an invite link, a reset link…). */
  confirm: (pin?: string) => Promise<z.infer<typeof resultData>>;
  cancel: () => Promise<void>;
  confirming: boolean;
  cancelling: boolean;
  /** The last confirm or cancel error (network, wrong PIN…); the card state stays the server's. */
  error: unknown;
  resetError: () => void;
}

export function usePendingAction(initial: PendingActionDto): UsePendingAction {
  const qc = useQueryClient();
  const id = initial.id;
  const { data } = useQuery({
    queryKey: key(id),
    initialData: initial,
    staleTime: 5_000,
    // While the operator is working, poll lightly in case a socket event is missed.
    refetchInterval: (q) => (q.state.data?.status === 'CONFIRMED' ? 10_000 : false),
    queryFn: async () =>
      (await api.get(`/v1/pending-actions/${id}`, { schema: pendingActionResponseSchema })).action,
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onUpdate = (payload: PendingActionUpdatedPayload) => {
      if (payload.id !== id) return;
      qc.setQueryData<PendingActionDto>(key(id), (old) =>
        old
          ? { ...old, status: payload.status, result: payload.result, failure: payload.failure }
          : old,
      );
    };
    socket.on('pendingAction.updated', onUpdate);
    return () => {
      socket.off('pendingAction.updated', onUpdate);
    };
  }, [id, qc]);

  const confirmM = useMutation({
    mutationFn: (pin?: string) =>
      api.post(`/v1/pending-actions/${id}/confirm`, pin ? { pin } : {}, {
        schema: confirmActionResponseSchema,
      }),
    onSuccess: ({ action }) => qc.setQueryData(key(id), action),
  });
  const cancelM = useMutation({
    mutationFn: () =>
      api.post(`/v1/pending-actions/${id}/cancel`, {}, { schema: pendingActionResponseSchema }),
    onSuccess: ({ action }) => qc.setQueryData(key(id), action),
  });

  return {
    action: data ?? initial,
    confirm: async (pin) => resultData.parse((await confirmM.mutateAsync(pin)).data),
    cancel: async () => {
      await cancelM.mutateAsync();
    },
    confirming: confirmM.isPending,
    cancelling: cancelM.isPending,
    error: confirmM.error ?? cancelM.error,
    resetError: () => {
      confirmM.reset();
      cancelM.reset();
    },
  };
}
