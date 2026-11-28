// What the member may borrow, from the server (R7). The quote endpoint answers with the member's limit
// ("Ton plafond") in an acceptance and in a refusal for an amount above it, so a one-franc quote tells
// the loan screen the range its amount control can offer. The app calculates nothing: no limit known
// (an active loan, a refusal without a limit) means the control is simply not shown.
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { loanQuoteSchema } from './useLoans';

export function useLoanLimit(groupId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['group', groupId ?? 'none', 'loan-limit'],
    enabled: !!groupId && enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<number | null> => {
      const { quote } = await api.post(
        `/v1/groups/${groupId}/loans/quote`,
        { amount: 1, months: 1 },
        { schema: loanQuoteSchema },
      );
      return quote.limit ?? null;
    },
  });
}
