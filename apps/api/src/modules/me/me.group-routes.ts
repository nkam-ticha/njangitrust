// GET /v1/groups/:groupId/me/reliability: my score in this group (R14, STA-02). Validate, call the
// service (which calls the rules package), answer.
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { myReliability } from './me.reliability';

export function meGroupRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/:groupId/me/reliability',
    handle({ params: z.strictObject({ groupId: uuidSchema }) }, async ({ params }, req, res) => {
      res.json({ reliability: await myReliability(actorOf(req).userId, params.groupId) });
    }),
  );

  return router;
}
