import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { toPendingAction } from '../../dto';
import { placeBid, readBids } from './bids.service';

const paramsSchema = z.strictObject({ groupId: uuidSchema, roundId: uuidSchema });
const bodySchema = z.strictObject({ amount: z.number().int().positive() });

export function bidsRoutes(): Router {
  const router = Router();
  router.use(requireAuth());
  router.get(
    '/:groupId/rounds/:roundId/bids',
    handle({ params: paramsSchema }, async ({ params }, req, res) => {
      res.json(await readBids(actorOf(req).userId, params.groupId, params.roundId));
    }),
  );
  router.post(
    '/:groupId/rounds/:roundId/bids',
    handle({ params: paramsSchema, body: bodySchema }, async ({ params, body }, req, res) => {
      const action = await placeBid(actorOf(req), params.groupId, params.roundId, body.amount);
      res.status(201).json({ action: toPendingAction(action) });
    }),
  );
  return router;
}
