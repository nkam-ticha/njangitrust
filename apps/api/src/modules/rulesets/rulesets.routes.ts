// GET /v1/groups/:groupId/rules (spec 2.7).
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { toRuleSet } from '../../dto';
import { readRules } from './rulesets.service';

export function rulesetsRoutes(): Router {
  const router = Router({ mergeParams: true });
  router.get(
    '/:groupId/rules',
    requireAuth(),
    handle({ params: z.strictObject({ groupId: uuidSchema }) }, async ({ params }, req, res) => {
      res.json({ ruleSet: toRuleSet(await readRules(actorOf(req).userId, params.groupId)) });
    }),
  );
  return router;
}
