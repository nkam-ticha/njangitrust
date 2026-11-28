// GET /v1/me, PATCH /v1/me, GET /v1/me/groups, GET /v1/me/summary. Validate, call the service, map with a DTO.
import { Router } from 'express';
import { updateMeRequestSchema } from '@njangi/shared/contracts/me';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { toMyGroup, toSelf } from '../../dto';
import { combinedSummary } from './me.summary';
import { getSelfSource, listMyGroups, updateMe } from './me.service';

export function meRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/',
    handle({}, async (_input, req, res) => {
      res.json({ user: toSelf(await getSelfSource(actorOf(req).userId)) });
    }),
  );

  router.patch(
    '/',
    handle({ body: updateMeRequestSchema }, async ({ body }, req, res) => {
      res.json({ user: toSelf(await updateMe(actorOf(req).userId, body)) });
    }),
  );

  router.get(
    '/groups',
    handle({}, async (_input, req, res) => {
      const groups = await listMyGroups(actorOf(req).userId);
      res.json({ groups: groups.map((g) => toMyGroup(g.group, g.membership, g.memberCount)) });
    }),
  );

  // GRP-05: one line per group I am in, from the groups' own services.
  router.get(
    '/summary',
    handle({}, async (_input, req, res) => {
      res.json(await combinedSummary(actorOf(req).userId));
    }),
  );

  return router;
}
