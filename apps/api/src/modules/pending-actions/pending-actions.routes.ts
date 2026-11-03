// GET /v1/pending-actions/:id, POST /:id/confirm, POST /:id/cancel (spec 2.7). The app draws the
// ConfirmationCard from these responses; only the owner can see or confirm an action.
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { confirmActionRequestSchema } from '@njangi/shared/contracts/pending-actions';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { toPendingAction } from '../../dto';
import { confirmPendingAction } from './pending-actions.confirm';
import { cancelPendingAction, getOwnPendingAction } from './pending-actions.service';

const params = z.strictObject({ id: uuidSchema });

export function pendingActionsRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/:id',
    handle({ params }, async ({ params: p }, req, res) => {
      res.json({ action: toPendingAction(await getOwnPendingAction(actorOf(req).userId, p.id)) });
    }),
  );

  router.post(
    '/:id/confirm',
    handle({ params, body: confirmActionRequestSchema }, async ({ params: p, body }, req, res) => {
      const { action, data } = await confirmPendingAction(actorOf(req), p.id, { pin: body.pin });
      res.json({ action: toPendingAction(action), data });
    }),
  );

  router.post(
    '/:id/cancel',
    handle({ params }, async ({ params: p }, req, res) => {
      res.json({ action: toPendingAction(await cancelPendingAction(actorOf(req).userId, p.id)) });
    }),
  );

  return router;
}
