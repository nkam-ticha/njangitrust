// GET /v1/groups/:groupId/members: public profiles, or the admin view for the admin (spec 2.11).
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { toMemberFor } from '../../dto';
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
  return router;
}
