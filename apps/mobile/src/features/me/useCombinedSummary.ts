// The combined summary of all my groups (FSD GRP-05): per group the round, what I owe now, what I
// can withdraw, unread messages and open votes. Every figure comes from the server.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { combinedSummarySchema, type CombinedSummaryDto } from '@njangi/shared/contracts/me';
import { api } from '@/api/client';

export const combinedSummaryKey = ['me', 'summary'] as const;

/** Looks for changes every 15 seconds, like the other live reads. */
export function useCombinedSummary(): UseQueryResult<CombinedSummaryDto> {
  return useQuery({
    queryKey: combinedSummaryKey,
    refetchInterval: 15_000,
    refetchOnWindowFocus: 'always',
    queryFn: async () => api.get('/v1/me/summary', { schema: combinedSummarySchema }),
  });
}
