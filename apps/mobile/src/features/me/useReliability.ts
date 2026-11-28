// My reliability score in one group (spec R14, FSD STA-02): the share of my last due items paid on
// time, with the counts. The server computes it (packages/rules); nothing is calculated here.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { reliabilityResponseSchema, type ReliabilityDto } from '@njangi/shared/contracts/me';
import { api, ApiError } from '@/api/client';

export const reliabilityKey = (groupId: string) => ['group', groupId, 'reliability'] as const;

/**
 * `percent` is null while I have fewer than 3 due items ("Nouveau membre", R14.2). The data is null
 * when the group is unknown to me or I may not read it.
 */
export function useMyReliability(groupId: string | null): UseQueryResult<ReliabilityDto | null> {
  return useQuery({
    queryKey: reliabilityKey(groupId ?? 'none'),
    enabled: !!groupId,
    queryFn: async () => {
      try {
        return (
          await api.get(`/v1/groups/${groupId}/me/reliability`, {
            schema: reliabilityResponseSchema,
          })
        ).reliability;
      } catch (error) {
        if (error instanceof ApiError && (error.status === 404 || error.status === 403))
          return null;
        throw error;
      }
    },
  });
}
