// Money reads for the Caisse tab (spec 2.7). Every read is validated with schemas.ts; nothing here
// calculates money: the figures come from the API (packages/rules on the server).
import { useCallback } from 'react';
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  solidarityRequestListSchema,
  type SolidarityRequestItem,
} from '@njangi/shared/contracts/solidarity';
import { api, ApiError } from '@/api/client';
import {
  type RoundDto,
  duesSchema,
  fundsSchema,
  ledgerPageSchema,
  myMoneySchema,
  payoutBreakdownSchema,
  paymentSchema,
  reconciliationSchema,
  roundResponseSchema,
  withdrawalSchema,
} from './schemas';

/** Money screens keep looking for changes made by other members (payments, votes, payouts). */
const LIVE_MS = 5_000;
const LIVE = { refetchInterval: LIVE_MS, refetchOnWindowFocus: 'always' as const };

export const moneyKeys = {
  group: (groupId: string) => ['group', groupId, 'money'] as const,
  round: (groupId: string, n: number | 'current') => ['group', groupId, 'round', n] as const,
  breakdown: (groupId: string, n: number) => ['group', groupId, 'breakdown', n] as const,
  dues: (groupId: string) => ['group', groupId, 'dues'] as const,
  myMoney: (groupId: string) => ['group', groupId, 'myMoney'] as const,
  funds: (groupId: string) => ['group', groupId, 'funds'] as const,
  ledger: (groupId: string, type: string | null) => ['group', groupId, 'ledger', type] as const,
  reconciliation: (groupId: string) => ['group', groupId, 'reconciliation'] as const,
  solidarity: (groupId: string) => ['group', groupId, 'solidarity'] as const,
  payment: (id: string) => ['payment', id] as const,
  withdrawal: (id: string) => ['withdrawal', id] as const,
};

/** The round in progress, or null when the cycle has not started (ROUND_NOT_FOUND). */
export function useCurrentRound(groupId: string | null) {
  return useQuery({
    queryKey: moneyKeys.round(groupId ?? 'none', 'current'),
    enabled: !!groupId,
    ...LIVE,
    queryFn: async () => {
      try {
        return (
          await api.get(`/v1/groups/${groupId}/rounds/current`, { schema: roundResponseSchema })
        ).round;
      } catch (error) {
        if (error instanceof ApiError && error.code === 'ROUND_NOT_FOUND') return null;
        throw error;
      }
    },
  });
}

export function useRound(groupId: string | null, number: number | null) {
  return useQuery({
    queryKey: moneyKeys.round(groupId ?? 'none', number ?? 0),
    enabled: !!groupId && number !== null,
    queryFn: async () =>
      (await api.get(`/v1/groups/${groupId}/rounds/${number}`, { schema: roundResponseSchema }))
        .round,
  });
}

/**
 * The rotation: who receives in which round, in order (spec R2). The API has no list of it, so each
 * round is read once (cached with the round reads). `total` is the number of rounds in the cycle.
 */
export function useRotation(groupId: string | null, total: number) {
  const results = useQueries({
    queries: Array.from({ length: total }, (_, i) => ({
      queryKey: moneyKeys.round(groupId ?? 'none', i + 1),
      enabled: !!groupId && total > 0,
      queryFn: async () =>
        (await api.get(`/v1/groups/${groupId}/rounds/${i + 1}`, { schema: roundResponseSchema }))
          .round,
    })),
  });
  const rounds = results.map((r) => r.data).filter((r): r is RoundDto => !!r);
  return {
    loading: results.some((r) => r.isPending),
    rounds,
    order: rounds.map((r) => r.beneficiaryMembershipId),
  };
}

export function usePayoutBreakdown(groupId: string | null, number: number | null, enabled = true) {
  return useQuery({
    queryKey: moneyKeys.breakdown(groupId ?? 'none', number ?? 0),
    enabled: enabled && !!groupId && number !== null,
    queryFn: () =>
      api.get(`/v1/groups/${groupId}/rounds/${number}/payout-breakdown`, {
        schema: payoutBreakdownSchema,
      }),
  });
}

export function useMyDues(groupId: string | null) {
  return useQuery({
    queryKey: moneyKeys.dues(groupId ?? 'none'),
    enabled: !!groupId,
    ...LIVE,
    queryFn: async () =>
      (await api.get(`/v1/groups/${groupId}/me/dues`, { schema: duesSchema })).dues,
  });
}

export function useMyMoney(groupId: string | null) {
  return useQuery({
    queryKey: moneyKeys.myMoney(groupId ?? 'none'),
    enabled: !!groupId,
    ...LIVE,
    queryFn: async () =>
      (await api.get(`/v1/groups/${groupId}/me/money`, { schema: myMoneySchema })).money,
  });
}

export function useFunds(groupId: string | null) {
  return useQuery({
    queryKey: moneyKeys.funds(groupId ?? 'none'),
    enabled: !!groupId,
    ...LIVE,
    queryFn: async () =>
      (await api.get(`/v1/groups/${groupId}/funds`, { schema: fundsSchema })).funds,
  });
}

export function useLedger(groupId: string | null, type: string | null) {
  return useInfiniteQuery({
    queryKey: moneyKeys.ledger(groupId ?? 'none', type),
    enabled: !!groupId,
    ...LIVE,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '30' });
      if (pageParam) params.set('before', String(pageParam));
      if (type) params.set('type', type);
      return api.get(`/v1/groups/${groupId}/ledger?${params.toString()}`, {
        schema: ledgerPageSchema,
      });
    },
    getNextPageParam: (last) => last.nextBefore,
  });
}

export function useReconciliation(groupId: string | null) {
  return useQuery({
    queryKey: moneyKeys.reconciliation(groupId ?? 'none'),
    enabled: !!groupId,
    ...LIVE,
    queryFn: async () =>
      (
        await api.get(`/v1/groups/${groupId}/reconciliation/latest`, {
          schema: reconciliationSchema,
        })
      ).reconciliation,
  });
}

export function useSolidarity(groupId: string | null) {
  return useQuery({
    queryKey: moneyKeys.solidarity(groupId ?? 'none'),
    enabled: !!groupId,
    ...LIVE,
    queryFn: (): Promise<{ fundBalance: number | null; requests: SolidarityRequestItem[] }> =>
      api.get(`/v1/groups/${groupId}/solidarity`, { schema: solidarityRequestListSchema }),
  });
}

/** Polls a payment until the operator answers (spec 2.6): the card alone is not the money. */
export function usePayment(paymentId: string | null) {
  return useQuery({
    queryKey: moneyKeys.payment(paymentId ?? 'none'),
    enabled: !!paymentId,
    queryFn: async () =>
      (await api.get(`/v1/payments/${paymentId}`, { schema: paymentSchema })).payment,
    refetchInterval: (q) =>
      q.state.data && (q.state.data.status === 'CREATED' || q.state.data.status === 'PENDING')
        ? 5_000
        : false,
  });
}

/** Polls a withdrawal the same way (spec 2.6, 2.7). */
export function useWithdrawal(withdrawalId: string | null) {
  return useQuery({
    queryKey: moneyKeys.withdrawal(withdrawalId ?? 'none'),
    enabled: !!withdrawalId,
    queryFn: async () =>
      (await api.get(`/v1/withdrawals/${withdrawalId}`, { schema: withdrawalSchema })).withdrawal,
    refetchInterval: (q) =>
      q.state.data && (q.state.data.status === 'CREATED' || q.state.data.status === 'PENDING')
        ? 5_000
        : false,
  });
}

/**
 * Refetches every money read of a group. Called after a confirmation and when the Caisse tab
 * regains focus: `round.updated` and `ledger.appended` are not in the typed realtime contract yet.
 */
export function useRefreshMoney(groupId: string | null) {
  const qc = useQueryClient();
  return useCallback(() => {
    if (!groupId) return;
    void qc.invalidateQueries({ queryKey: moneyKeys.group(groupId) });
    void qc.invalidateQueries({ queryKey: ['group', groupId, 'round'] });
    void qc.invalidateQueries({ queryKey: ['group', groupId, 'breakdown'] });
    void qc.invalidateQueries({ queryKey: ['group', groupId, 'ledger'] });
    void qc.invalidateQueries({ queryKey: ['group', groupId, 'solidarity'] });
  }, [groupId, qc]);
}

export type { RoundDto, DueDto, MyMoneyDto, PayoutBreakdownDto, PaymentDto } from './schemas';
