// Notification preferences (spec 1.8, D7, FSD NOT-03): categories (SECURITY always on), quiet hours
// in Douala time, chat mute per group, media download. Created with the defaults at sign-up.
import type { UpdateNotificationPrefs } from '@njangi/shared/contracts/notifications';
import { getPrisma } from '../../lib/prisma';

export interface PrefsSource {
  mutedCategories: string[];
  quietStartMinute: number;
  quietEndMinute: number;
  mutedChatGroupIds: string[];
  mediaAutoDownload: 'WIFI_ONLY' | 'ALWAYS' | 'NEVER';
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export async function getNotificationPrefs(userId: string): Promise<PrefsSource> {
  return getPrisma().notificationPrefs.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function updateNotificationPrefs(
  userId: string,
  input: UpdateNotificationPrefs,
): Promise<PrefsSource> {
  const data = {
    ...(input.mutedCategories ? { mutedCategories: [...new Set(input.mutedCategories)] } : {}),
    ...(input.quietHours
      ? {
          quietStartMinute: toMinutes(input.quietHours.from),
          quietEndMinute: toMinutes(input.quietHours.to),
        }
      : {}),
    ...(input.mutedChatGroupIds
      ? { mutedChatGroupIds: [...new Set(input.mutedChatGroupIds)] }
      : {}),
    ...(input.mediaAutoDownload ? { mediaAutoDownload: input.mediaAutoDownload } : {}),
  };
  return getPrisma().notificationPrefs.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}
