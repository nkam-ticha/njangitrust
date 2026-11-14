// POST /v1/groups, GET /v1/groups/:groupId/overview (spec 2.7).
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { createGroupRequestSchema } from '@njangi/shared/contracts/groups';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { toGroup, toMyMembership, toPendingAction } from '../../dto';
import { createPendingAction } from '../pending-actions';
import { createGroup, getGroupOverview } from './groups.service';

export function groupsRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.post(
    '/',
    handle({ body: createGroupRequestSchema }, async ({ body }, req, res) => {
      const created = await createGroup(actorOf(req).userId, body);
      res.status(201).json({
        group: toGroup(created.group, created.memberCount),
        me: toMyMembership(created.membership),
      });
    }),
  );

  router.get(
    '/:groupId/overview',
    handle({ params: z.strictObject({ groupId: uuidSchema }) }, async ({ params }, req, res) => {
      const overview = await getGroupOverview(actorOf(req).userId, params.groupId);
      res.json({
        group: toGroup(overview.group, overview.memberCount),
        me: toMyMembership(overview.membership),
        rulesVersion: overview.rulesVersion,
      });
    }),
  );

  // GRP-02/03: the admin starts the first cycle; returns a START_CYCLE card to confirm.
  router.post(
    '/:groupId/cycles/start',
    handle({ params: z.strictObject({ groupId: uuidSchema }) }, async ({ params }, req, res) => {
      const actor = actorOf(req);
      const action = await createPendingAction({
        userId: actor.userId,
        groupId: params.groupId,
        lang: actor.lang,
        origin: 'UI',
        type: 'START_CYCLE',
        args: { groupId: params.groupId },
      });
      res.status(201).json({ action: toPendingAction(action) });
    }),
  );

  return router;
}
