// GET /v1/groups/:groupId/members: public profiles, or the admin view for the admin (spec 2.11).
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { toMemberFor, toPendingAction } from '../../dto';
import { createPendingAction } from '../pending-actions';
import { listMembers } from './members.service';

export function membersRoutes(): Router {
  const router = Router();
  router.get(
    '/:groupId/members',
    requireAuth(),
    handle({ params: z.strictObject({ groupId: uuidSchema }) }, async ({ params }, req, res) => {
      const { viewer, members } = await listMembers(actorOf(req).userId, params.groupId);
      res.json({ members: members.map((m) => toMemberFor(viewer, m)) });
    }),
  );
  // R12.2: announce leaving at the end of the cycle; returns a LEAVE_AT_CYCLE_END card.
  router.post(
    '/:groupId/leave',
    requireAuth(),
    handle({ params: z.strictObject({ groupId: uuidSchema }) }, async ({ params }, req, res) => {
      const actor = actorOf(req);
      const action = await createPendingAction({
        userId: actor.userId,
        groupId: params.groupId,
        lang: actor.lang,
        origin: 'UI',
        type: 'LEAVE_AT_CYCLE_END',
        args: { groupId: params.groupId },
      });
      res.status(201).json({ action: toPendingAction(action) });
    }),
  );
  return router;
}
