// The member's own account (spec 2.7 Me). Only these responses ever carry a full phone number,
// and only the requester's own.
import { z } from 'zod';
import { instantSchema, languageSchema, nameSchema, uuidSchema } from './common';

export const operatorSchema = z.enum(['MTN', 'ORANGE', 'UNKNOWN']);
export const payableOperatorSchema = z.enum(['MTN', 'ORANGE']);

export const ownPaymentNumberSchema = z.strictObject({
  /** E.164, the member's own number. */
  number: z.string(),
  /** `6•• •• •7 89` for compact display. */
  masked: z.string(),
  operator: operatorSchema,
  activeFrom: instantSchema,
});

/** `toSelf`: what a member sees about themself. */
export const selfSchema = z.strictObject({
  id: uuidSchema,
  name: z.string(),
  /** The member's own login phone, E.164. */
  phone: z.string(),
  language: languageSchema,
  consentVersion: z.string(),
  consentAt: instantSchema,
  paymentNumber: ownPaymentNumberSchema.nullable(),
  createdAt: instantSchema,
});
export type SelfDto = z.infer<typeof selfSchema>;

export const updateMeRequestSchema = z
  .strictObject({ name: nameSchema().optional(), language: languageSchema.optional() })
  .refine((v) => v.name !== undefined || v.language !== undefined, 'EMPTY_UPDATE');
export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>;

export const membershipRoleSchema = z.enum(['ADMIN', 'MEMBER']);
export const membershipStatusSchema = z.enum(['INVITED', 'ACTIVE', 'LEAVING', 'LEFT', 'REMOVED']);
export const groupStatusSchema = z.enum(['FORMING', 'ACTIVE', 'CLOSED']);

/** One row of `GET /me/groups`. */
export const myGroupSchema = z.strictObject({
  groupId: uuidSchema,
  name: z.string(),
  status: groupStatusSchema,
  membershipId: uuidSchema,
  role: membershipRoleSchema,
  membershipStatus: membershipStatusSchema,
  memberCount: z.number().int(),
});
export type MyGroupDto = z.infer<typeof myGroupSchema>;
export const myGroupsResponseSchema = z.strictObject({ groups: z.array(myGroupSchema) });

export const devicePlatformSchema = z.enum(['ANDROID', 'IOS', 'WEB']);

export const registerDeviceRequestSchema = z.strictObject({
  platform: devicePlatformSchema,
  /** Expo push token; absent on web (D1). */
  expoPushToken: z
    .string()
    .regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/)
    .optional(),
});
export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;

export const deviceSchema = z.strictObject({
  id: uuidSchema,
  platform: devicePlatformSchema,
  pushEnabled: z.boolean(),
  lastSeenAt: instantSchema,
});
export type DeviceDto = z.infer<typeof deviceSchema>;

/**
 * R14, STA-02: the share of the member's last `window` due items paid on time, with the counts.
 * `percent` is null while the member has fewer than 3 due items ("Nouveau membre", R14.2).
 */
export const reliabilitySchema = z.strictObject({
  onTime: z.number().int().min(0),
  total: z.number().int().min(0),
  percent: z.number().int().min(0).max(100).nullable(),
  window: z.number().int().min(1),
});
export type ReliabilityDto = z.infer<typeof reliabilitySchema>;

/** GET /groups/:groupId/me/reliability. */
export const reliabilityResponseSchema = z.strictObject({ reliability: reliabilitySchema });

/** One group of `GET /me/summary` (GRP-05). Amounts are whole FCFA, as the group's own screens show them. */
export const summaryGroupSchema = z.strictObject({
  groupId: uuidSchema,
  name: z.string(),
  role: membershipRoleSchema,
  status: groupStatusSchema,
  /** The round in progress, or null before the first cycle starts. */
  currentRound: z
    .strictObject({
      number: z.number().int(),
      total: z.number().int(),
      dueAt: instantSchema,
    })
    .nullable(),
  /** What the member owes now in this group. */
  myDue: z.number().int().min(0),
  /** What the member can withdraw now from this group. */
  available: z.number().int().min(0),
  unreadMessages: z.number().int().min(0),
  /** Open votes the member may cast and has not cast yet. */
  openVotes: z.number().int().min(0),
});
export type SummaryGroupDto = z.infer<typeof summaryGroupSchema>;

/** GET /me/summary. */
export const combinedSummarySchema = z.strictObject({ groups: z.array(summaryGroupSchema) });
export type CombinedSummaryDto = z.infer<typeof combinedSummarySchema>;
