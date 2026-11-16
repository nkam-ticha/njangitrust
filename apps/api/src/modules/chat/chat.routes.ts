// Chat routes (spec 2.7 Chat, 1.7, 1.8, CHT-01..02). Routes only validate, call the service and
// map through the allowlist mapper; the logic is in chat.messages.ts and chat.read.ts.
//   GET    /v1/groups/:groupId/messages        newest first, `before`, `limit`, `pinned`
//   POST   /v1/groups/:groupId/messages        post (client `id` makes it idempotent)
//   GET    /v1/groups/:groupId/chat            unread, mentions, last read, mute
//   POST   /v1/groups/:groupId/read-marker     mark read
//   PUT    /v1/groups/:groupId/chat-mute       mute or unmute (push only)
//   POST   /v1/groups/:groupId/announcements   admin: a pinned announcement (returns a card)
//   DELETE /v1/messages/:messageId             delete your own message
//   POST   /v1/messages/:messageId/hide        admin: hide a message (returns a card)
//   GET    /v1/chat/unread                     the unread state of every group
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import {
  announcementRequestSchema,
  hideMessageRequestSchema,
  messageListQuerySchema,
  muteChatRequestSchema,
  readMarkerRequestSchema,
  sendMessageRequestSchema,
} from '@njangi/shared/contracts/chat-messages';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { toPendingAction } from '../../dto';
import { requestAnnouncement, requestHide } from './chat.actions';
import { deleteMessage, listMessages, sendMessage } from './chat.messages';
import { getChatState, getChatStates, markChatRead, muteChat } from './chat.read';

const groupParams = z.strictObject({ groupId: uuidSchema });
const messageParams = z.strictObject({ messageId: uuidSchema });

export function chatGroupRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/:groupId/messages',
    handle(
      { params: groupParams, query: messageListQuerySchema },
      async ({ params, query }, req, res) => {
        res.json(await listMessages(actorOf(req).userId, params.groupId, query));
      },
    ),
  );

  router.post(
    '/:groupId/messages',
    handle(
      { params: groupParams, body: sendMessageRequestSchema },
      async ({ params, body }, req, res) => {
        const { message, created } = await sendMessage(actorOf(req).userId, params.groupId, body);
        res.status(created ? 201 : 200).json({ message });
      },
    ),
  );

  router.get(
    '/:groupId/chat',
    handle({ params: groupParams }, async ({ params }, req, res) => {
      res.json(await getChatState(actorOf(req).userId, params.groupId));
    }),
  );

  router.post(
    '/:groupId/read-marker',
    handle(
      { params: groupParams, body: readMarkerRequestSchema },
      async ({ params, body }, req, res) => {
        const upTo = body.upTo ? new Date(body.upTo) : undefined;
        res.json(await markChatRead(actorOf(req).userId, params.groupId, upTo));
      },
    ),
  );

  router.put(
    '/:groupId/chat-mute',
    handle(
      { params: groupParams, body: muteChatRequestSchema },
      async ({ params, body }, req, res) => {
        res.json(await muteChat(actorOf(req).userId, params.groupId, body.muted));
      },
    ),
  );

  router.post(
    '/:groupId/announcements',
    handle(
      { params: groupParams, body: announcementRequestSchema },
      async ({ params, body }, req, res) => {
        const action = await requestAnnouncement(actorOf(req), params.groupId, body.text);
        res.status(201).json({ action: toPendingAction(action) });
      },
    ),
  );

  return router;
}

export function chatMessageRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.delete(
    '/:messageId',
    handle({ params: messageParams }, async ({ params }, req, res) => {
      await deleteMessage(actorOf(req).userId, params.messageId);
      res.status(204).end();
    }),
  );

  router.post(
    '/:messageId/hide',
    handle(
      { params: messageParams, body: hideMessageRequestSchema },
      async ({ params, body }, req, res) => {
        const action = await requestHide(actorOf(req), params.messageId, body.reason);
        res.status(201).json({ action: toPendingAction(action) });
      },
    ),
  );

  return router;
}

export function chatUnreadRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/unread',
    handle({}, async (_input, req, res) => {
      res.json({ groups: await getChatStates(actorOf(req).userId) });
    }),
  );

  return router;
}
