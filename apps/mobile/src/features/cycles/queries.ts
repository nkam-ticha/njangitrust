// Cycle reads and the "start the next cycle" card (spec R2, R9, D40). Nothing here calculates money or
// dates: the figures, the kept order and the suggested first payout come from the API.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cycleListSchema,
  cycleSummarySchema,
  nextCyclePreviewSchema,
} from '@njangi/shared/contracts/cycles';
import { pendingActionCreatedSchema } from '@njangi/shared/contracts/pending-actions';
import { api } from '@/api/client';

const LIVE = { refetchInterval: 10_000, refetchOnWindowFocus: 'always' as const };

export const cycleKeys = {
  list: (groupId: string) => ['group', groupId, 'cycles'] as const,
  summary: (groupId: string, n: number) => ['group', groupId, 'cycles', n] as const,
  next: (groupId: string) => ['group', groupId, 'cycles', 'next'] as const,
};

/** The group's phase (forming, in a cycle, between cycles) and its cycles. */
export function useCycles(groupId: string | null) {
  return useQuery({
    queryKey: cycleKeys.list(groupId ?? 'none'),
    enabled: !!groupId,
    ...LIVE,
    queryFn: () => api.get(`/v1/groups/${groupId}/cycles`, { schema: cycleListSchema }),
  });
}

/** What a closed cycle did with the general fund, and the caller's own outcome. */
export function useCycleSummary(groupId: string | null, number: number | null) {
  return useQuery({
    queryKey: cycleKeys.summary(groupId ?? 'none', number ?? 0),
    enabled: !!groupId && number !== null,
    queryFn: () =>
      api.get(`/v1/groups/${groupId}/cycles/${number}`, { schema: cycleSummarySchema }),
  });
}

/** The next cycle as it will start (only between two cycles). */
export function useNextCyclePreview(groupId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: cycleKeys.next(groupId ?? 'none'),
    enabled: !!groupId && enabled,
    queryFn: () => api.get(`/v1/groups/${groupId}/cycles/next`, { schema: nextCyclePreviewSchema }),
  });
}

/** Prepares a START_CYCLE card with the first payout the admin chose (D40.2); the admin confirms it. */
export function useStartNextCycle(groupId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (firstPayoutAt: string) =>
      (
        await api.post(
          `/v1/groups/${groupId}/cycles/start`,
          { firstPayoutAt },
          { schema: pendingActionCreatedSchema },
        )
      ).action,
    onSettled: () => {
      if (groupId) void qc.invalidateQueries({ queryKey: ['group', groupId, 'cycles'] });
    },
  });
}
