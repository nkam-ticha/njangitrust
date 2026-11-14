// Proposals and votes (spec 2.7 Proposals, R11, FSD GOV-01..04). Every change to the group passes
// by one of these. SOLIDARITY_PAYOUT is created by a solidarity request (contracts/solidarity) and
// ADMIN_LOAN by the admin's loan request; the others are proposed here.
import { z } from 'zod';
import {
  bilingualSchema,
  instantSchema,
  nameSchema,
  phoneSchema,
  textSchema,
  uuidSchema,
} from './common';
import { ruleSetParamsSchema } from './groups';

export const proposalTypeSchema = z.enum([
  'RULE_CHANGE',
  'MEMBER_ADD',
  'MEMBER_REMOVE',
  'ROTATION_CHANGE',
  'ADMIN_CHANGE',
  'EARLY_EXIT',
  'ADMIN_LOAN',
  'SOLIDARITY_PAYOUT',
  'FINE_WAIVER',
  'LEDGER_CORRECTION',
]);
export type ProposalType = z.infer<typeof proposalTypeSchema>;

export const proposalStatusSchema = z.enum(['OPEN', 'PASSED', 'REJECTED', 'EXPIRED']);
export const thresholdKindSchema = z.enum(['MAJORITY', 'TWO_THIRDS']);
export const voteChoiceSchema = z.enum(['YES', 'NO']);

/** A rule change: any subset of the rule set (3.2), validated against the ranges by the rules engine. */
export const ruleChangesSchema = ruleSetParamsSchema.partial();

const reason = textSchema(500);

export const createProposalRequestSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('RULE_CHANGE'),
    changes: ruleChangesSchema,
    reason: reason.optional(),
  }),
  z.strictObject({
    type: z.literal('MEMBER_ADD'),
    name: nameSchema(),
    /** Used only to bind the later invite; stored as a keyed hash, never shown to anyone. */
    phone: phoneSchema,
    reason: reason.optional(),
  }),
  z.strictObject({ type: z.literal('MEMBER_REMOVE'), membershipId: uuidSchema, reason }),
  z.strictObject({
    type: z.literal('ROTATION_CHANGE'),
    /** Two members whose turns are swapped. */
    swap: z.tuple([uuidSchema, uuidSchema]),
    reason: reason.optional(),
  }),
  z.strictObject({
    type: z.literal('ADMIN_CHANGE'),
    membershipId: uuidSchema,
    reason: reason.optional(),
  }),
  /** The proposer leaves mid-cycle (R12.3). */
  z.strictObject({ type: z.literal('EARLY_EXIT'), reason }),
  /** `fineId` is the FINE obligation to cancel. */
  z.strictObject({ type: z.literal('FINE_WAIVER'), fineId: uuidSchema, reason }),
  z.strictObject({
    type: z.literal('LEDGER_CORRECTION'),
    seq: z.number().int().min(1),
    /** What is wrong and what the correct entry should be, in the proposer's words. */
    correction: textSchema(1_000),
    reason,
  }),
]);
export type CreateProposalRequest = z.infer<typeof createProposalRequestSchema>;

export const castVoteRequestSchema = z.strictObject({ choice: voteChoiceSchema });
export type CastVoteRequest = z.infer<typeof castVoteRequestSchema>;

const memberRef = z.strictObject({ membershipId: uuidSchema, name: z.string() });
export type MemberRefDto = z.infer<typeof memberRef>;

/** What the proposal is about. Never a phone number. */
export const proposalSubjectSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('RULE_CHANGE'),
    changes: z.array(
      z.strictObject({
        parameter: z.string(),
        from: z.unknown(),
        to: z.unknown(),
        label: bilingualSchema,
      }),
    ),
  }),
  z.strictObject({ type: z.literal('MEMBER_ADD'), inviteeName: z.string() }),
  z.strictObject({ type: z.literal('MEMBER_REMOVE'), member: memberRef }),
  z.strictObject({ type: z.literal('ROTATION_CHANGE'), swap: z.tuple([memberRef, memberRef]) }),
  z.strictObject({ type: z.literal('ADMIN_CHANGE'), member: memberRef }),
  z.strictObject({ type: z.literal('EARLY_EXIT'), member: memberRef }),
  z.strictObject({
    type: z.literal('ADMIN_LOAN'),
    member: memberRef,
    amount: z.number().int(),
    months: z.number().int(),
  }),
  z.strictObject({
    type: z.literal('SOLIDARITY_PAYOUT'),
    recipient: memberRef,
    event: z.enum(['DEUIL', 'NAISSANCE', 'MALADIE', 'MARIAGE', 'AUTRE']),
    amount: z.number().int(),
    note: z.string().nullable(),
  }),
  z.strictObject({
    type: z.literal('FINE_WAIVER'),
    member: memberRef,
    amount: z.number().int(),
    roundNumber: z.number().int().nullable(),
  }),
  z.strictObject({
    type: z.literal('LEDGER_CORRECTION'),
    seq: z.number().int(),
    correction: z.string(),
  }),
]);
export type ProposalSubjectDto = z.infer<typeof proposalSubjectSchema>;

export const proposalSchema = z.strictObject({
  id: uuidSchema,
  groupId: uuidSchema,
  type: proposalTypeSchema,
  status: proposalStatusSchema,
  secret: z.boolean(),
  /** "Ajouter Hervé Kamga", "Amende de retard : 1 000 → 1 500" (designer copy votes.titles). */
  title: bilingualSchema,
  subject: proposalSubjectSchema,
  reason: z.string().nullable(),
  proposer: memberRef,
  thresholdKind: thresholdKindSchema,
  requiredYes: z.number().int(),
  eligibleCount: z.number().int(),
  /** ROTATION_CHANGE: members whose turn moves; each must vote yes. */
  mustApprove: z.array(memberRef),
  /** How many eligible members have voted. Always visible. */
  participation: z.number().int(),
  /** Yes and no totals. Null for a secret proposal until it closes (R11.5). */
  tally: z.strictObject({ yes: z.number().int(), no: z.number().int() }).nullable(),
  /** Who voted what, for non-secret proposals only; always null for a secret one. */
  votes: z.array(z.strictObject({ member: memberRef, choice: voteChoiceSchema })).nullable(),
  /** The viewer's own vote; for a secret proposal only that they voted. */
  myVote: z.enum(['YES', 'NO', 'VOTED']).nullable(),
  canVote: z.boolean(),
  opensAt: instantSchema,
  closesAt: instantSchema,
  closedAt: instantSchema.nullable(),
  effect: bilingualSchema.nullable(),
});
export type ProposalDto = z.infer<typeof proposalSchema>;

export const proposalResponseSchema = z.strictObject({ proposal: proposalSchema });
export const proposalListSchema = z.strictObject({ proposals: z.array(proposalSchema) });
export const proposalListQuerySchema = z.strictObject({
  status: z.enum(['OPEN', 'CLOSED']).optional(),
});
