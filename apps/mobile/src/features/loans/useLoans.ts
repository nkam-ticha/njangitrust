// Loans (spec 2.7 Loans, R7, FSD LOA-01..03). Requests, decisions and repayments return PendingAction
// cards; the quote is a simulation and moves nothing.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { fcfaSchema, instantSchema, uuidSchema } from '@njangi/shared/contracts/common';
import { pendingActionCreatedSchema } from '@njangi/shared/contracts/pending-actions';
import { api } from '@/api/client';

export const loanStatusSchema = z.enum([
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'DISBURSED',
  'REPAID',
  'OVERDUE',
  'EXPIRED',
]);
export type LoanStatus = z.infer<typeof loanStatusSchema>;

export const loanSchema = z.object({
  id: uuidSchema,
  borrower: z.object({ membershipId: uuidSchema, name: z.string() }),
  principal: fcfaSchema,
  months: z.number().int(),
  ratePermille: z.number().int().nullable(),
  interest: fcfaSchema.nullable(),
  feeEstimated: fcfaSchema.nullable(),
  totalDue: fcfaSchema.nullable(),
  status: loanStatusSchema,
  decisionReason: z.string().nullable(),
  createdAt: instantSchema,
  decidedAt: instantSchema.nullable(),
  installments: z.array(
    z.object({
      id: uuidSchema,
      amount: fcfaSchema,
      dueAt: instantSchema,
      status: z.string(),
    }),
  ),
});
export type LoanDto = z.infer<typeof loanSchema>;
export const loansSchema = z.object({ loans: z.array(loanSchema) });

/** A quote: a refusal carries its code; otherwise the terms and the installment dates. */
export const loanQuoteSchema = z.object({
  quote: z.union([
    z.object({
      ok: z.literal(true),
      principal: fcfaSchema,
      months: z.number().int(),
      interest: fcfaSchema,
      feeEstimate: fcfaSchema,
      totalDue: fcfaSchema,
      limit: fcfaSchema,
      ratePermille: z.number().int(),
      installments: z.array(
        z.object({
          number: z.number().int(),
          amount: fcfaSchema,
          due: z.discriminatedUnion('status', [
            z.object({ status: z.literal('DATED'), dueAt: instantSchema }),
            z.object({ status: z.literal('NEXT_CYCLE') }).passthrough(),
          ]),
        }),
      ),
    }),
    z.object({
      ok: z.literal(false),
      code: z.string(),
      limit: fcfaSchema.optional(),
      amount: fcfaSchema.optional(),
    }),
  ]),
});
export type LoanQuoteDto = z.infer<typeof loanQuoteSchema>['quote'];

const listKey = (groupId: string) => ['group', groupId, 'loans'] as const;

export function useLoans(groupId: string | null) {
  return useQuery({
    queryKey: listKey(groupId ?? 'none'),
    enabled: !!groupId,
    queryFn: async () =>
      (await api.get(`/v1/groups/${groupId}/loans`, { schema: loansSchema })).loans,
  });
}

export function useLoanQuote(groupId: string | null) {
  return useMutation({
    mutationFn: async (input: { amount: number; months: number }) =>
      (await api.post(`/v1/groups/${groupId}/loans/quote`, input, { schema: loanQuoteSchema }))
        .quote,
  });
}

export function useRequestLoan(groupId: string | null) {
  return useMutation({
    mutationFn: async (input: { amount: number; months: number }) =>
      (
        await api.post(`/v1/groups/${groupId}/loans`, input, {
          schema: pendingActionCreatedSchema,
        })
      ).action,
  });
}

/** The admin approves or rejects a request (a reason is required to refuse). */
export function useLoanDecision() {
  return useMutation({
    mutationFn: async (input: { loanId: string; decision: 'approve' | 'reject'; reason: string }) =>
      (
        await api.post(
          `/v1/loans/${input.loanId}/decision`,
          { decision: input.decision, reason: input.reason },
          { schema: pendingActionCreatedSchema },
        )
      ).action,
  });
}

/** Repays the next installment: a repayment card the borrower confirms. */
export function useLoanRepayment(groupId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (loanId: string) =>
      (await api.post(`/v1/loans/${loanId}/repayments`, {}, { schema: pendingActionCreatedSchema }))
        .action,
    onSettled: () => void qc.invalidateQueries({ queryKey: listKey(groupId ?? 'none') }),
  });
}

export function useRefreshLoans(groupId: string | null) {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: listKey(groupId ?? 'none') });
}
