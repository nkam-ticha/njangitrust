// Authentication (spec 2.10, D1, D8). Mobile clients receive the refresh token in the body; web
// clients get it as an httpOnly cookie scoped to /v1/auth and keep the access token in memory.
import { z } from 'zod';
import { instantSchema, languageSchema, nameSchema, phoneSchema, pinSchema, uuidSchema } from './common';
import { payableOperatorSchema, selfSchema } from './me';

/** Version of the privacy notice a member accepts at sign-up (Part 7). */
export const CURRENT_CONSENT_VERSION = '2026-11';

export const signupRequestSchema = z.strictObject({
  name: nameSchema(),
  phone: phoneSchema,
  /** Defaults to the login phone. The operator is detected when omitted. */
  paymentNumber: z
    .strictObject({ number: phoneSchema, operator: payableOperatorSchema.optional() })
    .optional(),
  consent: z.literal(true),
  consentVersion: z.string().min(1).max(20),
  pin: pinSchema,
  language: languageSchema.optional(),
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const loginRequestSchema = z.strictObject({ phone: phoneSchema, pin: pinSchema });
export type LoginRequest = z.infer<typeof loginRequestSchema>;

const refreshTokenSchema = z.string().min(40).max(200);

/** Mobile sends the token in the body; web sends nothing and the cookie is used. */
export const refreshRequestSchema = z.strictObject({ refreshToken: refreshTokenSchema.optional() });
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const logoutRequestSchema = refreshRequestSchema;

export const pinChangeRequestSchema = z.strictObject({ currentPin: pinSchema, newPin: pinSchema });
export type PinChangeRequest = z.infer<typeof pinChangeRequestSchema>;

export const pinResetRequestSchema = z.strictObject({ phone: phoneSchema });

/** Completing a reset from the one-time link: the account's login phone and the new PIN. */
export const pinResetCompleteRequestSchema = z.strictObject({ phone: phoneSchema, newPin: pinSchema });
export type PinResetCompleteRequest = z.infer<typeof pinResetCompleteRequestSchema>;

export const sessionSchema = z.strictObject({
  accessToken: z.string(),
  accessTokenExpiresAt: instantSchema,
  /** Mobile only. Web clients receive it as an httpOnly cookie. */
  refreshToken: z.string().optional(),
  refreshTokenExpiresAt: instantSchema,
});
export type SessionDto = z.infer<typeof sessionSchema>;

export const authResponseSchema = z.strictObject({ user: selfSchema, session: sessionSchema });
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const refreshResponseSchema = z.strictObject({ session: sessionSchema });

/** Always the same body, whether or not the phone has an account (no enumeration). */
export const pinResetRequestedSchema = z.strictObject({ status: z.literal('REQUESTED') });

export const pinResetLinkPreviewSchema = z.strictObject({
  name: z.string(),
  expiresAt: instantSchema,
});

/** A PIN reset request the viewer can confirm (admin, or for an admin two members, D8). */
export const pinResetRequestItemSchema = z.strictObject({
  id: uuidSchema,
  memberName: z.string(),
  membershipId: uuidSchema,
  requestedAt: instantSchema,
  expiresAt: instantSchema,
  confirmationsNeeded: z.number().int(),
  confirmationsGiven: z.number().int(),
  confirmedByMe: z.boolean(),
});
export type PinResetRequestItem = z.infer<typeof pinResetRequestItemSchema>;
export const pinResetRequestListSchema = z.strictObject({
  requests: z.array(pinResetRequestItemSchema),
});

/** Result data of a confirmed PIN_RESET_APPROVE action, shown once to the confirming member. */
export const pinResetApprovalResultSchema = z.strictObject({
  approved: z.boolean(),
  link: z.string().optional(),
  linkExpiresAt: instantSchema.optional(),
});
