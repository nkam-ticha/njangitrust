// Proposals and votes (spec 2.7 Proposals, R11). Phase 0 ships MEMBER_ADD; Phase 5 adds the
// other types to the same discriminated union.
import { z } from 'zod';
import { bilingualSchema, instantSchema, nameSchema, phoneSchema, textSchema, uuidSchema } from './common';

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

const memberAddRequestSchema = z.strictObject({
  type: z.literal('MEMBER_ADD'),
  name: nameSchema(),
  /** Used only to bind the later invite; stored as a keyed hash, never shown to anyone. */
  phone: phoneSchema,
  reason: textSchema(500).optional(),
});

export const createProposalRequestSchema = z.discriminatedUnion('type', [memberAddRequestSchema]);
export type CreateProposalRequest = z.infer<typeof createProposalRequestSchema>;

export const castVoteRequestSchema = z.strictObject({ choice: voteChoiceSchema });
export type CastVoteRequest = z.infer<typeof castVoteRequestSchema>;

/** What the proposal is about, without personal data. */
export const proposalSubjectSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('MEMBER_ADD'), inviteeName: z.string() }),
]);

export const proposalSchema = z.strictObject({
  id: uuidSchema,
  groupId: uuidSchema,
  type: proposalTypeSchema,
  status: proposalStatusSchema,
  secret: z.boolean(),
  subject: proposalSubjectSchema,
  reason: z.string().nullable(),
  proposer: z.strictObject({ membershipId: uuidSchema, name: z.string() }),
  thresholdKind: thresholdKindSchema,
  requiredYes: z.number().int(),
  eligibleCount: z.number().int(),
  /** How many eligible members have voted. Always visible. */
  participation: z.number().int(),
  /** Yes and no totals. Null for a secret proposal until it closes (R11.5). */
  tally: z.strictObject({ yes: z.number().int(), no: z.number().int() }).nullable(),
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
