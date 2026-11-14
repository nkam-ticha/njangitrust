// Notifications (spec 2.7, 1.8):
//   GET  /v1/notifications                 the member's own, newest first, with the unread count
//   GET  /v1/notifications/unread-count    for the bell
//   POST /v1/notifications/read            { ids } or { all: true }
//   GET  /v1/me/notification-prefs, PUT /v1/me/notification-prefs
import { Router } from 'express';
import {
  markReadRequestSchema,
  notificationListQuerySchema,
  updateNotificationPrefsSchema,
} from '@njangi/shared/contracts/notifications';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { isoOrNull, toNotification, toNotificationPrefs } from '../../dto';
import {
  listNotifications,
  markNotificationsRead,
  unreadNotificationCount,
} from './notifications.read';
import { getNotificationPrefs, updateNotificationPrefs } from './prefs.service';

export function notificationsRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/',
    handle({ query: notificationListQuerySchema }, async ({ query }, req, res) => {
      const page = await listNotifications(actorOf(req).userId, query);
      res.json({
        notifications: page.notifications.map(toNotification),
        unreadCount: page.unreadCount,
        nextBefore: isoOrNull(page.nextBefore),
      });
    }),
  );

  router.get(
    '/unread-count',
    handle({}, async (_input, req, res) => {
      res.json({ unreadCount: await unreadNotificationCount(actorOf(req).userId) });
    }),
  );

  router.post(
    '/read',
    handle({ body: markReadRequestSchema }, async ({ body }, req, res) => {
      const userId = actorOf(req).userId;
      await markNotificationsRead(userId, body);
      res.json({ unreadCount: await unreadNotificationCount(userId) });
    }),
  );

  return router;
}

export function notificationPrefsRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/',
    handle({}, async (_input, req, res) => {
      res.json({ prefs: toNotificationPrefs(await getNotificationPrefs(actorOf(req).userId)) });
    }),
  );

  router.put(
    '/',
    handle({ body: updateNotificationPrefsSchema }, async ({ body }, req, res) => {
      res.json({
        prefs: toNotificationPrefs(await updateNotificationPrefs(actorOf(req).userId, body)),
      });
    }),
  );

  return router;
}
