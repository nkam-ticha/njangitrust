// PendingAction lifecycle (spec 4.5): the server prepares the card, the member confirms or cancels
// it here, and `pendingAction.updated` moves it to processing, done or failed. The agent is never
// involved in confirming.
//
// One tap, one send. The first tap is taken synchronously by a per-card flight (not React state),
// so a second tap, or the same card open on two screens, joins the request already running instead
// of sending another. `confirming` turns true in the same event as the tap, so the card shows
// "sending" at once. If the server still answers "already confirmed" it is shown as the card's
// real state, not as an error (confirmFlow.ts). The server keeps its exactly-once claim.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { PendingActionUpdatedPayload } from '@njangi/shared/contracts/realtime';
import {
  confirmActionResponseSchema,
  pendingActionResponseSchema,
  type PendingActionDto,
} from '@njangi/shared/contracts/pending-actions';
import { api } from '@/api/client';
import { withSocket } from '@/api/socket';
import { createKeyedFlights } from '@/lib/singleFlight';
import { applyUpdate, pendingActionKey } from './actionState';
import { cancelFlow, confirmFlow, type CardStore } from './confirmFlow';

const resultData = z.record(z.string(), z.unknown()).nullable();

const confirmFlights = createKeyedFlights();
const cancelFlights = createKeyedFlights();
const subscribeFlights = (listener: () => void) => {
  const stops = [confirmFlights.subscribe(listener), cancelFlights.subscribe(listener)];
  return () => stops.forEach((stop) => stop());
};

/** After this long past `expiresAt` by the phone's clock, ask the server whether the card expired. */
const EXPIRY_GRACE_MS = 1_000;
/** If the server still says PENDING (the phone's clock runs ahead), look again after this. */
const EXPIRY_RECHECK_MS = 15_000;

export interface UsePendingAction {
  action: PendingActionDto;
  /**
   * Confirms the card. Resolves with the action's one-time data (an invite link, a reset link…), or
   * null when the card had already been handled: look at `action.status` for what happened.
   */
  confirm: (pin?: string) => Promise<z.infer<typeof resultData>>;
  cancel: () => Promise<void>;
  /** A confirm is on its way (this card, on any screen): the card shows "sending". */
  confirming: boolean;
  cancelling: boolean;
  /** The last confirm or cancel error (network, wrong PIN…); the card state stays the server's. */
  error: unknown;
  resetError: () => void;
}

export function usePendingAction(initial: PendingActionDto): UsePendingAction {
  const qc = useQueryClient();
  const id = initial.id;
  const { data, refetch } = useQuery({
    queryKey: pendingActionKey(id),
    initialData: initial,
    staleTime: 5_000,
    // While the operator is working, poll lightly in case a socket event is missed.
    refetchInterval: (q) => (q.state.data?.status === 'CONFIRMED' ? 10_000 : false),
    queryFn: async () =>
      (await api.get(`/v1/pending-actions/${id}`, { schema: pendingActionResponseSchema })).action,
  });
  const action = data ?? initial;

  // Realtime: only forward moves are applied (actionState.ts).
  useEffect(
    () =>
      withSocket((socket) => {
        const onUpdate = (payload: PendingActionUpdatedPayload) => {
          if (payload.id !== id) return;
          qc.setQueryData<PendingActionDto>(pendingActionKey(id), (old) =>
            old ? applyUpdate(old, payload) : old,
          );
        };
        socket.on('pendingAction.updated', onUpdate);
        return () => {
          socket.off('pendingAction.updated', onUpdate);
        };
      }),
    [id, qc],
  );

  // A card nobody tapped for 10 minutes becomes "expired" on screen without a reload.
  const expiresAt = action.status === 'PENDING' ? action.expiresAt : null;
  useEffect(() => {
    if (!expiresAt) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      void refetch().then((result) => {
        if (result.data?.status === 'PENDING') timer = setTimeout(check, EXPIRY_RECHECK_MS);
      });
    };
    const wait = Math.max(0, new Date(expiresAt).getTime() - Date.now()) + EXPIRY_GRACE_MS;
    timer = setTimeout(check, wait);
    return () => clearTimeout(timer);
  }, [expiresAt, refetch]);

  const store: CardStore = {
    current: () => qc.getQueryData<PendingActionDto>(pendingActionKey(id)) ?? initial,
    put: (card) => qc.setQueryData(pendingActionKey(id), card),
    fetchLatest: async () =>
      (
        await api.get(`/v1/pending-actions/${id}`, {
          schema: pendingActionResponseSchema,
        })
      ).action,
  };

  const busy = useSyncExternalStore(
    subscribeFlights,
    () => `${confirmFlights.active(id)}|${cancelFlights.active(id)}`,
  );
  const [error, setError] = useState<unknown>(null);
  // The PIN travels in a ref, never in React state or the query cache.
  const pinRef = useRef<string | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const confirm = useCallback(
    (pin?: string) => {
      pinRef.current = pin;
      setError(null);
      return confirmFlights
        .join(id, async () => {
          const sent = pinRef.current;
          pinRef.current = undefined;
          const outcome = await confirmFlow(store, () =>
            api.post(`/v1/pending-actions/${id}/confirm`, sent ? { pin: sent } : {}, {
              schema: confirmActionResponseSchema,
            }),
          );
          return outcome.alreadyHandled ? null : resultData.parse(outcome.data);
        })
        .catch((e: unknown) => {
          if (mounted.current) setError(e);
          throw e;
        });
    },
    // `store` is rebuilt every render but only reads `qc`, `id` and `initial`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, qc],
  );

  const cancel = useCallback(async () => {
    setError(null);
    await cancelFlights
      .join(id, () =>
        cancelFlow(store, () =>
          api.post(`/v1/pending-actions/${id}/cancel`, {}, { schema: pendingActionResponseSchema }),
        ),
      )
      .catch((e: unknown) => {
        if (mounted.current) setError(e);
        throw e;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, qc]);

  return {
    action,
    confirm,
    cancel,
    confirming: busy.startsWith('true'),
    cancelling: busy.endsWith('|true'),
    error,
    resetError: () => setError(null),
  };
}
