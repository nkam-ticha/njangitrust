import { Router } from 'express';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { z } from 'zod';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { authorizeGroup } from '../../permissions';
import { latestGroupReconciliation } from './reconciliation.service';

export function reconciliationRoutes(): Router {
  const router = Router();
  router.use(requireAuth());
  router.get(
    '/:groupId/reconciliation/latest',
    handle({ params: z.strictObject({ groupId: uuidSchema }) }, async ({ params }, req, res) => {
      const actor = actorOf(req);
      await authorizeGroup(actor.userId, params.groupId, 'group.funds.read');
      res.json({ reconciliation: await latestGroupReconciliation(actor.userId, params.groupId) });
    }),
  );
  return router;
}
