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
