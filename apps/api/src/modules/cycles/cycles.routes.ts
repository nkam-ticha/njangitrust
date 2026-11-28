// GET /v1/groups/:groupId/cycles, /cycles/next and /cycles/:number (D40). Thin: validate, call the
// service, return its allowlisted result. Starting a cycle stays POST /groups/:id/cycles/start.
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { listCycles, readCycleSummary, readNextCycle } from './cycles.read';

const params = z.strictObject({ groupId: uuidSchema });
const cycleParams = params.extend({ number: z.coerce.number().int().min(1).max(10_000) });

export function cyclesRoutes(): Router {
  const router = Router();
  router.use(requireAuth());
  router.get(
    '/:groupId/cycles',
    handle({ params }, async ({ params: p }, req, res) => {
      res.json(await listCycles(actorOf(req).userId, p.groupId));
    }),
  );
  router.get(
    '/:groupId/cycles/next',
    handle({ params }, async ({ params: p }, req, res) => {
      res.json(await readNextCycle(actorOf(req).userId, p.groupId));
    }),
  );
  router.get(
    '/:groupId/cycles/:number',
    handle({ params: cycleParams }, async ({ params: p }, req, res) => {
      res.json(await readCycleSummary(actorOf(req).userId, p.groupId, p.number));
    }),
  );
  return router;
}
