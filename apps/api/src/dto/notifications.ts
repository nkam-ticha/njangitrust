// Notification and chat-message mappers.
import type { MessageDto } from '@njangi/shared/contracts/chat';
import type { NotificationDto, NotificationPrefsDto } from '@njangi/shared/contracts/notifications';
import { bilingualSchema } from '@njangi/shared/contracts/common';
import { iso, isoOrNull } from './time';

export interface NotificationSource {
  id: string;
  groupId: string | null;
  category: NotificationDto['category'];
  titleFr: string;
  titleEn: string;
  bodyFr: string;
  bodyEn: string;
  deepLink: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export function toNotification(n: NotificationSource): NotificationDto {
  return {
    id: n.id,
    groupId: n.groupId,
    category: n.category,
    title: { fr: n.titleFr, en: n.titleEn },
    body: { fr: n.bodyFr, en: n.bodyEn },
    deepLink: n.deepLink,
    readAt: isoOrNull(n.readAt),
    createdAt: iso(n.createdAt),
  };
}

export interface MessageSource {
  id: string;
  groupId: string;
  kind: MessageDto['kind'];
  text: string | null;
  systemText: unknown;
  deletedAt: Date | null;
  hiddenByAdminAt: Date | null;
  createdAt: Date;
  author: { id: string; user: { name: string } } | null;
}

export function toMessage(m: MessageSource): MessageDto {
  const removed = m.deletedAt !== null || m.hiddenByAdminAt !== null;
  const system = bilingualSchema.safeParse(m.systemText);
  return {
    id: m.id,
    groupId: m.groupId,
    kind: m.kind,
    text: removed ? null : m.text,
    systemText: system.success ? system.data : null,
    author: m.author ? { membershipId: m.author.id, name: m.author.user.name } : null,
    createdAt: iso(m.createdAt),
  };
}

const hhmm = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

export interface PrefsDtoSource {
  mutedCategories: string[];
  quietStartMinute: number;
  quietEndMinute: number;
  mutedChatGroupIds: string[];
  mediaAutoDownload: 'WIFI_ONLY' | 'ALWAYS' | 'NEVER';
}

/** Spec 1.8: SECURITY can never appear muted, whatever is stored. */
export function toNotificationPrefs(p: PrefsDtoSource): NotificationPrefsDto {
  return {
    mutedCategories: p.mutedCategories.filter(
      (c): c is NotificationPrefsDto['mutedCategories'][number] =>
        c === 'REMINDERS' || c === 'MONEY' || c === 'VOTES' || c === 'GROUP',
    ),
    quietHours: { from: hhmm(p.quietStartMinute), to: hhmm(p.quietEndMinute) },
    mutedChatGroupIds: p.mutedChatGroupIds,
    mediaAutoDownload: p.mediaAutoDownload,
  };
}
