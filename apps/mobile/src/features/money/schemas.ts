// Money responses (spec 2.6, 2.7 Rounds, Payments, Withdrawals, Ledger). The money contracts are not
// in packages/shared yet, so the app validates the API's shapes here. Amounts are integer FCFA.
import { z } from 'zod';
import { fcfaSchema, instantSchema, uuidSchema } from '@njangi/shared/contracts/common';

const int = fcfaSchema;

export const roundSchema = z.object({
  id: uuidSchema,
  number: z.number().int(),
  cycle: z.number().int(),
  mode: z.enum(['FIXED', 'BIDDING']),
  status: z.string(),
  dueAt: instantSchema,
  payoutAt: instantSchema,
  beneficiaryMembershipId: uuidSchema.nullable(),
  beneficiaryName: z.string().nullable(),
  contributionAmount: int.nullable(),
  paidCount: z.number().int(),
  contributionCount: z.number().int(),
  collected: int,
  unpaidMembershipIds: z.array(uuidSchema),
});
export type RoundDto = z.infer<typeof roundSchema>;
export const roundResponseSchema = z.object({ round: roundSchema });

export const payoutBreakdownSchema = z.object({
  roundId: uuidSchema,
  round: z.number().int(),
  payoutAt: instantSchema,
  breakdown: z.object({
    collected: int,
    collectionFees: int,
    credited: int,
    deductions: z.array(z.object({ kind: z.string(), amount: int })),
    deductionsTotal: int,
    withdrawn: int,
    withdrawalFees: int,
    remaining: int,
    nextWithdrawal: z.object({ maxAmount: int, fee: int }).nullable(),
  }),
  debtsDue: int,
  asOf: instantSchema,
});
export type PayoutBreakdownDto = z.infer<typeof payoutBreakdownSchema>;

export const obligationKindSchema = z.enum([
  'CONTRIBUTION',
  'SOLIDARITY',
  'FINE',
  'LOAN_INSTALLMENT',
  'BID',
  'SHORTFALL_SHARE',
  'CORRECTION',
]);
export type ObligationKind = z.infer<typeof obligationKindSchema>;

export const duesSchema = z.object({
  dues: z.array(
    z.object({
      id: uuidSchema,
      kind: obligationKindSchema,
      amount: int,
      dueAt: instantSchema,
      loanId: uuidSchema.nullable(),
      roundNumber: z.number().int().nullable(),
    }),
  ),
});
export type DueDto = z.infer<typeof duesSchema>['dues'][number];

export const myMoneySchema = z.object({
  money: z.object({
    available: int,
    locked: int,
    unlocksAt: instantSchema.nullable(),
    debtsDue: int,
    hold: z.object({ reason: z.string(), until: instantSchema }).nullable(),
    withdrawalsPaused: z.boolean(),
    withdrawalInProgress: z.boolean(),
  }),
});
export type MyMoneyDto = z.infer<typeof myMoneySchema>['money'];

export const fundsSchema = z.object({
  funds: z.object({
    cash: int,
    generalFund: int,
    solidarityFund: int,
    payables: int,
    pots: int,
    receivables: int,
    inFlight: int,
    availableForLoans: int,
  }),
});

export const ledgerPostingSchema = z.object({ account: z.string(), amount: int });
export const ledgerEntrySchema = z.object({
  id: uuidSchema,
  seq: z.number().int(),
  type: z.string(),
  occurredAt: instantSchema,
  roundId: uuidSchema.nullable(),
  membershipId: uuidSchema.nullable(),
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  descriptionFr: z.string(),
  descriptionEn: z.string(),
  postings: z.array(ledgerPostingSchema),
  prevHash: z.string().nullable(),
  hash: z.string(),
});
export type LedgerEntryDto = z.infer<typeof ledgerEntrySchema>;
export const ledgerPageSchema = z.object({
  entries: z.array(ledgerEntrySchema),
  nextBefore: z.number().int().nullable(),
});

export const paymentSchema = z.object({
  payment: z.object({
    id: uuidSchema,
    amount: int,
    status: z.enum(['CREATED', 'PENDING', 'SUCCESSFUL', 'FAILED', 'EXPIRED']),
    createdAt: instantSchema,
    settledAt: instantSchema.nullable(),
    operatorRef: z.string().nullable(),
  }),
});
export type PaymentDto = z.infer<typeof paymentSchema>['payment'];

export const withdrawalSchema = z.object({
  withdrawal: z.object({
    id: uuidSchema,
    amount: int,
    feeEstimated: int,
    feeActual: int.nullable(),
    status: z.enum(['CREATED', 'PENDING', 'SUCCESSFUL', 'FAILED', 'EXPIRED']),
    createdAt: instantSchema,
    settledAt: instantSchema.nullable(),
  }),
});
export type WithdrawalDto = z.infer<typeof withdrawalSchema>['withdrawal'];

export const reconciliationSchema = z.object({
  reconciliation: z
    .object({
      ranAt: instantSchema,
      status: z.string(),
      withdrawalsPaused: z.boolean(),
      reason: z.string().nullable(),
    })
    .nullable(),
});
