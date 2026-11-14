// In-app notifications (spec 1.8, 2.13). Every push also exists here.
import { z } from 'zod';
import { bilingualSchema, instantSchema, uuidSchema } from './common';

export const notificationCategorySchema = z.enum([
  'REMINDERS',
  'MONEY',
  'VOTES',
  'GROUP',
  'SECURITY',
]);
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

export const notificationListQuerySchema = z.strictObject({
  /** Cursor: the `createdAt` of the last notification already shown. */
  before: instantSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  unread: z.enum(['true', 'false']).optional(),
});

export const notificationListSchema = z.strictObject({
  notifications: z.array(notificationSchema),
  unreadCount: z.number().int(),
  nextBefore: instantSchema.nullable(),
});

/** Mark some notifications read, or all of them. */
export const markReadRequestSchema = z.union([
  z.strictObject({ ids: z.array(uuidSchema).min(1).max(200) }),
  z.strictObject({ all: z.literal(true) }),
]);

/** "HH:MM", Africa/Douala time. */
const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Spec 1.8: categories (SECURITY can never be turned off), quiet hours, chat mute, media. */
export const notificationPrefsSchema = z.strictObject({
  mutedCategories: z.array(notificationCategorySchema.exclude(['SECURITY'])),
  quietHours: z.strictObject({ from: clockTimeSchema, to: clockTimeSchema }),
  mutedChatGroupIds: z.array(uuidSchema),
  mediaAutoDownload: z.enum(['WIFI_ONLY', 'ALWAYS', 'NEVER']),
});
export type NotificationPrefsDto = z.infer<typeof notificationPrefsSchema>;

/** PUT /me/notification-prefs: any subset; omitted fields keep their value. */
export const updateNotificationPrefsSchema = notificationPrefsSchema.partial();
export type UpdateNotificationPrefs = z.infer<typeof updateNotificationPrefsSchema>;

/** GET /notifications/unread-count and POST /notifications/read. */
export const unreadCountSchema = z.strictObject({ unreadCount: z.number().int() });

export const notificationPrefsResponseSchema = z.strictObject({ prefs: notificationPrefsSchema });
