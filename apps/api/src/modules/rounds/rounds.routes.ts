// Round reads (spec 2.7). Route handlers only validate, call the service and return its DTO.
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { currentRound, readPayoutBreakdown, readRound } from './rounds.service';

const params = z.strictObject({ groupId: uuidSchema });
const roundParams = params.extend({ number: z.coerce.number().int().min(1).max(50) });

export function roundsRoutes(): Router {
  const router = Router();
  router.use(requireAuth());
  router.get(
    '/:groupId/rounds/current',
    handle({ params }, async ({ params: p }, req, res) => {
      res.json(await currentRound(actorOf(req).userId, p.groupId));
    }),
  );
  router.get(
    '/:groupId/rounds/:number',
    handle({ params: roundParams }, async ({ params: p }, req, res) => {
      res.json(await readRound(actorOf(req).userId, p.groupId, p.number));
    }),
  );
  router.get(
    '/:groupId/rounds/:number/payout-breakdown',
    handle({ params: roundParams }, async ({ params: p }, req, res) => {
      res.json(await readPayoutBreakdown(actorOf(req).userId, p.groupId, p.number));
    }),
  );
  return router;
}
