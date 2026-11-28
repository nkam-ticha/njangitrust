// Cycles (spec R2, R9, R12.2, D40): the list of a group's cycles, what a closed cycle did with the
// general fund, and what the next cycle will look like. Amounts are integer FCFA. Nothing here names
// a member's debts or number: a member sees only their own outcome.
import { z } from 'zod';
import { instantSchema, uuidSchema } from './common';

export const cyclePhaseSchema = z.enum(['FORMING', 'IN_CYCLE', 'BETWEEN_CYCLES', 'CLOSED']);
export type CyclePhase = z.infer<typeof cyclePhaseSchema>;

export const cycleItemSchema = z.strictObject({
  number: z.number().int().min(1),
  mode: z.enum(['FIXED', 'BIDDING']),
  startedAt: instantSchema.nullable(),
  closedAt: instantSchema.nullable(),
});
export type CycleItem = z.infer<typeof cycleItemSchema>;

export const cycleListSchema = z.strictObject({
  phase: cyclePhaseSchema,
  /** The running cycle, or null before the first one and between two cycles. */
  current: cycleItemSchema.nullable(),
  /** Every cycle of the group, newest first. */
  cycles: z.array(cycleItemSchema),
  /** Active or invited members who will take part in the next cycle (between cycles). */
  participants: z.number().int().nullable(),
});
export type CycleList = z.infer<typeof cycleListSchema>;

/** Why the general fund was not shared at a cycle's close, when it was not. */
export const fundShareReasonSchema = z.enum([
  'DISTRIBUTION_OFF',
  'NOTHING_TO_DISTRIBUTE',
  'NO_ELIGIBLE_MEMBER',
]);

export const cycleSummarySchema = z.strictObject({
  number: z.number().int().min(1),
  mode: z.enum(['FIXED', 'BIDDING']),
  startedAt: instantSchema.nullable(),
  closedAt: instantSchema.nullable(),
  /** From the CYCLE_CLOSED entry of the ledger; null while the cycle runs. */
  fund: z
    .strictObject({
      fundBalance: z.number().int(),
      receivables: z.number().int(),
      distributable: z.number().int(),
      share: z.number().int(),
      distributed: z.number().int(),
      /** What stays in the general fund for the next cycle. */
      remainder: z.number().int(),
      eligibleCount: z.number().int(),
      reason: fundShareReasonSchema.nullable(),
    })
    .nullable(),
  /** The caller's own outcome only. */
  mine: z
    .strictObject({
      outcome: z.enum(['SHARE', 'DEBT', 'NOT_IN_CYCLE', 'NOTHING_SHARED']),
      share: z.number().int(),
      /** What the caller still owes (their own obligations); 0 unless outcome is DEBT. */
      owed: z.number().int(),
      /** The caller left with this cycle (R12.2). */
      leftAtEnd: z.boolean(),
    })
    .nullable(),
});
export type CycleSummary = z.infer<typeof cycleSummarySchema>;

export const nextCyclePreviewSchema = z.strictObject({
  /** Number the next cycle will have. */
  number: z.number().int().min(1),
  /** Members who will take part (active, plus invited who join at this cycle). */
  participants: z.number().int(),
  newcomers: z.number().int(),
  minimum: z.number().int(),
  /** The admin can start it: between cycles, enough members, caller is the admin. */
  canStart: z.boolean(),
  orderKind: z.enum(['KEPT', 'DRAWN', 'BIDDING']),
  /** Names in rotation order for a kept order; empty for a draw or bidding. */
  order: z.array(
    z.strictObject({
      membershipId: uuidSchema,
      name: z.string(),
      newcomer: z.boolean(),
    }),
  ),
  /** The earliest date the rules accept (H3), at the group's payout time. */
  suggestedFirstPayoutAt: instantSchema,
});
export type NextCyclePreview = z.infer<typeof nextCyclePreviewSchema>;

export const startNextCycleRequestSchema = z.strictObject({
  /** D40.2: the admin chooses the first payout date and time; absent = the suggested one. */
  firstPayoutAt: instantSchema.optional(),
});
