// In-app notifications (spec 1.8, 2.13). Every push also exists here.
import { z } from 'zod';
import { bilingualSchema, instantSchema, uuidSchema } from './common';

export const notificationCategorySchema = z.enum(['REMINDERS', 'MONEY', 'VOTES', 'GROUP', 'SECURITY']);
export type NotificationCategory = z.infer<typeof notificationCategorySchema>;

export const notificationSchema = z.strictObject({
  id: uuidSchema,
  groupId: uuidSchema.nullable(),
  category: notificationCategorySchema,
  title: bilingualSchema,
  body: bilingualSchema,
  /** App route to open; never carries personal data. */
  deepLink: z.string().nullable(),
  readAt: instantSchema.nullable(),
  createdAt: instantSchema,
});
export type NotificationDto = z.infer<typeof notificationSchema>;
