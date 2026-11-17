// Statements (spec 2.14): a member's own statement for a period, its PDF (a signed link valid 5
// minutes) and the code an institution checks. Creating one is a read-like write: no card.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  statementDownloadSchema,
  statementListSchema,
  statementResponseSchema,
  type CreateStatementRequest,
} from '@njangi/shared/contracts/statements';
import { api } from '@/api/client';

const listKey = (groupId: string) => ['group', groupId, 'statements'] as const;

export function useStatements(groupId: string | null) {
  return useQuery({
    queryKey: listKey(groupId ?? 'none'),
    enabled: !!groupId,
    queryFn: async () =>
      (await api.get(`/v1/me/statements?groupId=${groupId}`, { schema: statementListSchema }))
        .statements,
  });
}

export function useCreateStatement(groupId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (period: CreateStatementRequest['period']) =>
      (
        await api.post(
          '/v1/me/statements',
          { groupId, period },
          { schema: statementResponseSchema },
        )
      ).statement,
    onSuccess: () => void qc.invalidateQueries({ queryKey: listKey(groupId ?? 'none') }),
  });
}

/** The PDF link of a statement (valid 5 minutes): fetched when the member opens it. */
export function useStatementDownload() {
  return useMutation({
    mutationFn: (statementId: string) =>
      api.get(`/v1/me/statements/${statementId}`, { schema: statementDownloadSchema }),
  });
}
