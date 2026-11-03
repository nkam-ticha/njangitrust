// Invitations (spec 2.10, R1.5, R1.6, R12.1): single use, 72 hours, tied to the invited phone.
import { z } from 'zod';
import { instantSchema, languageSchema, nameSchema, phoneSchema, pinSchema, uuidSchema } from './common';
import { payableOperatorSchema, selfSchema } from './me';
import { groupSchema, myMembershipSchema, ruleSetSchema } from './groups';
import { sessionSchema } from './auth';

/** The admin asks for an invite; it becomes a PendingAction to confirm. */
export const createInviteRequestSchema = z.strictObject({
  name: nameSchema(),
  phone: phoneSchema,
  /** The passed MEMBER_ADD. Not needed before the first cycle (founding members). */
  proposalId: uuidSchema.optional(),
});
export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>;

/** Result data of a confirmed INVITE_CREATE, returned once to the admin to share. */
export const inviteCreatedSchema = z.strictObject({
  inviteId: uuidSchema,
  link: z.string(),
  expiresAt: instantSchema,
});
export type InviteCreatedDto = z.infer<typeof inviteCreatedSchema>;

export const inviteStatusSchema = z.enum(['PENDING', 'USED', 'EXPIRED', 'REVOKED']);

/** The admin's list of invites. No phone number, not even masked. */
export const inviteListItemSchema = z.strictObject({
  id: uuidSchema,
  inviteeName: z.string(),
  status: inviteStatusSchema,
  founding: z.boolean(),
  expiresAt: instantSchema,
  createdAt: instantSchema,
});
export const inviteListSchema = z.strictObject({ invites: z.array(inviteListItemSchema) });

/** Public view of an invite link (R1.5): group, who invited, current rules. */
export const invitePreviewSchema = z.strictObject({
  groupName: z.string(),
  invitedByName: z.string(),
  inviteeName: z.string(),
  memberCount: z.number().int(),
  founding: z.boolean(),
  expiresAt: instantSchema,
  rules: ruleSetSchema,
});
export type InvitePreviewDto = z.infer<typeof invitePreviewSchema>;

/** A new person signs up while accepting; the phone must be the invited one. */
const acceptWithSignupSchema = z.strictObject({
  mode: z.literal('signup'),
  name: nameSchema(),
  phone: phoneSchema,
  paymentNumber: z
    .strictObject({ number: phoneSchema, operator: payableOperatorSchema.optional() })
    .optional(),
  consent: z.literal(true),
  consentVersion: z.string().min(1).max(20),
  pin: pinSchema,
  language: languageSchema.optional(),
});

/** Someone who already has an account accepts while logged in; their login phone must match. */
const acceptAsExistingSchema = z.strictObject({ mode: z.literal('existing') });

export const acceptInviteRequestSchema = z.discriminatedUnion('mode', [
  acceptWithSignupSchema,
  acceptAsExistingSchema,
]);
export type AcceptInviteRequest = z.infer<typeof acceptInviteRequestSchema>;

export const acceptInviteResponseSchema = z.strictObject({
  group: groupSchema,
  me: myMembershipSchema,
  /** Present when the invite created the account. */
  user: selfSchema.optional(),
  session: sessionSchema.optional(),
});
