// Groups, members and rules (spec 2.7 Groups, 3.2). Value ranges are checked by @njangi/rules
// (validateRuleSet); these schemas only fix the shape and types.
import { z } from 'zod';
import { instantSchema, nameSchema, uuidSchema } from './common';
import { groupStatusSchema, membershipRoleSchema, membershipStatusSchema } from './me';

const int = z.number().int();

export const monthlyAnchorKindSchema = z.enum(['DAY_OF_MONTH', 'LAST_WEEKDAY', 'NTH_WEEKDAY']);

export const monthlyAnchorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('DAY_OF_MONTH'), day: int }),
  z.strictObject({ kind: z.literal('LAST_WEEKDAY'), weekday: int }),
  z.strictObject({ kind: z.literal('NTH_WEEKDAY'), nth: int, weekday: int }),
]);

export const payoutTimeSchema = z.strictObject({
  hour: int,
  minute: int,
  monthlyAnchor: monthlyAnchorSchema,
});

/** 3.2: a group's rule set. Money in FCFA, rates in permille. */
export const ruleSetParamsSchema = z.strictObject({
  contributionAmount: int,
  solidarityContribution: int,
  frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']),
  payoutTime: payoutTimeSchema,
  lateFine: int,
  rotationMode: z.enum(['FIXED', 'BIDDING']),
  minBid: int,
  loanRatePermille: int,
  loanMaxMonths: int,
  loanLimitFactorPermille: int,
  numberChangeHoldHours: int,
  voteWindowHours: int,
  solidarityVoteWindowHours: int,
  meetingAbsenceFine: int,
  distributeFundAtCycleEnd: z.boolean(),
  reliabilityWindow: int,
});
export type RuleSetParamsDto = z.infer<typeof ruleSetParamsSchema>;

/** Rules chosen at creation; anything omitted takes the 3.2 default. The payout time comes from
 * `firstPayoutAt` and `monthlyAnchor`. */
export const ruleSetInputSchema = ruleSetParamsSchema.omit({ payoutTime: true }).partial();

export const createGroupRequestSchema = z.strictObject({
  name: nameSchema(80),
  /** First payout date and time; must be in the future. */
  firstPayoutAt: instantSchema,
  /** Monthly groups: how the payout day repeats (DECISIONS Q1). Default DAY_OF_MONTH. */
  monthlyAnchor: monthlyAnchorKindSchema.optional(),
  rules: ruleSetInputSchema.optional(),
});
export type CreateGroupRequest = z.infer<typeof createGroupRequestSchema>;

export const groupSchema = z.strictObject({
  id: uuidSchema,
  name: z.string(),
  status: groupStatusSchema,
  firstPayoutAt: instantSchema,
  memberCount: int,
  createdAt: instantSchema,
});
export type GroupDto = z.infer<typeof groupSchema>;

export const myMembershipSchema = z.strictObject({
  membershipId: uuidSchema,
  role: membershipRoleSchema,
  status: membershipStatusSchema,
});

export const groupCreatedSchema = z.strictObject({ group: groupSchema, me: myMembershipSchema });

/** Phase 0 overview; the money modules add the cycle, round and funds. */
export const groupOverviewSchema = z.strictObject({
  group: groupSchema,
  me: myMembershipSchema,
  rulesVersion: int,
});
export type GroupOverviewDto = z.infer<typeof groupOverviewSchema>;

/** `toPublicMember`: what every member sees about another. Never a phone number. */
export const publicMemberSchema = z.strictObject({
  membershipId: uuidSchema,
  name: z.string(),
  role: membershipRoleSchema,
  status: membershipStatusSchema,
  isMe: z.boolean(),
  joinedAt: instantSchema,
});
export type PublicMemberDto = z.infer<typeof publicMemberSchema>;

/** `toAdminView`: the admin also sees when members become active or left. Never a phone number. */
export const adminMemberSchema = publicMemberSchema.extend({
  activeFromCycle: int.nullable(),
  leftAt: instantSchema.nullable(),
});
export type AdminMemberDto = z.infer<typeof adminMemberSchema>;

export const membersResponseSchema = z.strictObject({
  members: z.array(z.union([adminMemberSchema, publicMemberSchema])),
});

export const ruleSetSchema = z.strictObject({
  version: int,
  params: ruleSetParamsSchema,
  effectiveFromRoundId: uuidSchema.nullable(),
  createdAt: instantSchema,
});
export type RuleSetDto = z.infer<typeof ruleSetSchema>;

export const rulesResponseSchema = z.strictObject({ ruleSet: ruleSetSchema });
