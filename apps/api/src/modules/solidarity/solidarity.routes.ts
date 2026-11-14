// Solidarity fund (spec 2.7 Solidarity, R10, FSD SOL-01):
//   GET  /v1/groups/:groupId/solidarity             the fund's balance and the requests
//   POST /v1/groups/:groupId/solidarity-requests    returns a card opening a SOLIDARITY_PAYOUT vote
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { solidarityRequestSchema } from '@njangi/shared/contracts/solidarity';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { toPendingAction, toSolidarityRequest } from '../../dto';
import { requestSolidarity } from '../proposals';
import { readSolidarity } from './solidarity.service';

const groupParams = z.strictObject({ groupId: uuidSchema });

export function solidarityRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/:groupId/solidarity',
    handle({ params: groupParams }, async ({ params }, req, res) => {
      const { fundBalance, requests } = await readSolidarity(actorOf(req).userId, params.groupId);
      res.json({ fundBalance, requests: requests.map(toSolidarityRequest) });
    }),
  );

  router.post(
    '/:groupId/solidarity-requests',
    handle(
      { params: groupParams, body: solidarityRequestSchema },
      async ({ params, body }, req, res) => {
        const action = await requestSolidarity(actorOf(req), params.groupId, body);
        res.status(201).json({ action: toPendingAction(action) });
      },
    ),
  );

  return router;
}
