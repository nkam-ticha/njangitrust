// Agent tools for notifications (spec 4.6): the member's own notifications and preferences, through
// the same services and mappers as GET /notifications and PUT /me/notification-prefs.
import { formatDateTime } from '@njangi/shared';
import { updateNotificationPrefsSchema } from '@njangi/shared/contracts/notifications';
import { ok } from '../../agent/tools/outcomes';
import { needGroup } from '../../agent/tools/resolve-group';
import { SPECS } from '../../agent/tools/specs';
import { implement } from '../../agent/tools/types';
import { toNotification, toNotificationPrefs } from '../../dto';
import { listNotifications } from './notifications.read';
import { getNotificationPrefs, updateNotificationPrefs } from './prefs.service';

export const notificationTools = [
  implement(SPECS.get_notifications, async (ctx, a) => {
    const page = await listNotifications(ctx.userId, {
      limit: 10,
      ...(a.unreadOnly ? { unread: 'true' as const } : {}),
    });
    return ok({
      unreadCount: page.unreadCount,
      notifications: page.notifications.map(toNotification).map((n) => ({
        title: n.title[ctx.lang],
        body: n.body[ctx.lang],
        read: n.readAt !== null,
        at: formatDateTime(n.createdAt, ctx.lang),
      })),
    });
  }),
  implement(SPECS.set_notification_prefs, async (ctx, a) => {
    let mutedChatGroupIds: string[] | undefined;
    if (a.muteChat !== undefined) {
      const noGroup = needGroup(ctx);
      if (noGroup) return noGroup;
      const current = toNotificationPrefs(await getNotificationPrefs(ctx.userId)).mutedChatGroupIds;
      const others = current.filter((id) => id !== ctx.groupId);
      mutedChatGroupIds = a.muteChat ? [...others, ctx.groupId!] : others;
    }
    const update = updateNotificationPrefsSchema.parse({
      ...(mutedChatGroupIds ? { mutedChatGroupIds } : {}),
      ...(a.quietHours ? { quietHours: a.quietHours } : {}),
      ...(a.categories ? { mutedCategories: a.categories } : {}),
    });
    const prefs = toNotificationPrefs(await updateNotificationPrefs(ctx.userId, update));
    return ok({
      quietHours: prefs.quietHours,
      mutedCategories: prefs.mutedCategories,
      activeGroupChatMuted: ctx.groupId ? prefs.mutedChatGroupIds.includes(ctx.groupId) : false,
    });
  }),
];
