// Media routes (spec 2.7 Chat, 2.12):
//   POST /v1/groups/:groupId/attachments                    an upload slot (and one for the preview)
//   POST /v1/groups/:groupId/attachments/:ticketId/complete the file is stored: check it, register it
//   GET  /v1/attachments/:attachmentId                      the file's signed URLs, valid 5 minutes
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import {
  completeUploadRequestSchema,
  createUploadTicketRequestSchema,
} from '@njangi/shared/contracts/media';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { completeUpload, createUploadTicket, getAttachmentAccess } from './media.service';

const groupParams = z.strictObject({ groupId: uuidSchema });
const ticketParams = z.strictObject({ groupId: uuidSchema, ticketId: uuidSchema });
const attachmentParams = z.strictObject({ attachmentId: uuidSchema });

export function mediaGroupRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.post(
    '/:groupId/attachments',
    handle(
      { params: groupParams, body: createUploadTicketRequestSchema },
      async ({ params, body }, req, res) => {
        res.status(201).json(await createUploadTicket(actorOf(req).userId, params.groupId, body));
      },
    ),
  );

  router.post(
    '/:groupId/attachments/:ticketId/complete',
    handle(
      { params: ticketParams, body: completeUploadRequestSchema },
      async ({ params, body }, req, res) => {
        const attachment = await completeUpload(
          actorOf(req).userId,
          params.groupId,
          params.ticketId,
          body,
        );
        res.status(201).json({ attachment });
      },
    ),
  );

  return router;
}

export function attachmentRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/:attachmentId',
    handle({ params: attachmentParams }, async ({ params }, req, res) => {
      res.json(await getAttachmentAccess(actorOf(req).userId, params.attachmentId));
    }),
  );

  return router;
}
