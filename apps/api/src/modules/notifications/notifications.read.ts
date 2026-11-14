// The member's notifications (spec 2.7 GET /notifications, POST /notifications/read): their own
// only, newest first, with the unread count for the bell.
import { clock } from '../../lib/clock';
import { getPrisma } from '../../lib/prisma';
import type { NotificationSource } from '../../dto';

export async function listNotifications(
  userId: string,
  query: {
    before?: string | undefined;
    limit?: number | undefined;
    unread?: 'true' | 'false' | undefined;
  },
): Promise<{ notifications: NotificationSource[]; unreadCount: number; nextBefore: Date | null }> {
  const limit = query.limit ?? 30;
  const prisma = getPrisma();
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: {
        userId,
        ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {}),
        ...(query.unread === 'true' ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    }),
    unreadNotificationCount(userId),
  ]);
  const page = rows.slice(0, limit);
  return {
    notifications: page,
    unreadCount,
    nextBefore: rows.length > limit ? page[page.length - 1]!.createdAt : null,
  };
}

export function unreadNotificationCount(userId: string): Promise<number> {
  return getPrisma().notification.count({ where: { userId, readAt: null } });
}

/** Marks the member's own notifications read; ids of someone else's are ignored. */
export async function markNotificationsRead(
  userId: string,
  input: { ids: string[] } | { all: true },
): Promise<number> {
  const result = await getPrisma().notification.updateMany({
    where: { userId, readAt: null, ...('ids' in input ? { id: { in: input.ids } } : {}) },
    data: { readAt: clock.now() },
  });
  return result.count;
}
