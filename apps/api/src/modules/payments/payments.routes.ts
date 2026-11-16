import { Router } from 'express';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { z } from 'zod';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { toPendingAction } from '../../dto';
import { createPendingAction } from '../pending-actions';
import { authorizeGroup } from '../../permissions';
import { getOwnPayment } from './payments.service';

const requestSchema = z.strictObject({ obligationIds: z.array(uuidSchema).min(1).max(30) });

export function paymentGroupRoutes(): Router {
  const router = Router();
  router.use(requireAuth());
  router.post(
    '/:groupId/payments',
    handle(
      { params: z.strictObject({ groupId: uuidSchema }), body: requestSchema },
      async ({ params, body }, req, res) => {
        const actor = actorOf(req);
        await authorizeGroup(actor.userId, params.groupId, 'group.payments.create');
        const action = await createPendingAction({
          userId: actor.userId,
          groupId: params.groupId,
          lang: actor.lang,
          origin: 'UI',
          type: 'PAY',
          args: { groupId: params.groupId, obligationIds: body.obligationIds },
        });
        res.status(201).json({ action: toPendingAction(action) });
      },
    ),
  );
  return router;
}

export function paymentRoutes(): Router {
  const router = Router();
  router.use(requireAuth());
  router.get(
    '/:paymentId',
    handle({ params: z.strictObject({ paymentId: uuidSchema }) }, async ({ params }, req, res) => {
      const actor = actorOf(req);
      res.json({ payment: await getOwnPayment(actor.userId, params.paymentId) });
    }),
  );
  return router;
}
