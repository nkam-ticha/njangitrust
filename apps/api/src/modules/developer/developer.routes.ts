// /v1/developer (D28). Routes only validate, call the service and map with the developer's DTOs.
//   POST   /v1/developer/login               body { username, password }  -> { session }
//   GET    /v1/developer/users               ?q&status&page&pageSize
//   GET    /v1/developer/users/:id
//   DELETE /v1/developer/users/:id           delete the account (the member's own safeguards apply)
//   GET    /v1/developer/groups              ?q&status&page&pageSize
//   GET    /v1/developer/groups/:id
//   POST   /v1/developer/groups/:id/close    close and hide the group
import { Router } from 'express';
import {
  developerGroupsQuerySchema,
  developerIdParamsSchema,
  developerLoginRequestSchema,
  developerUsersQuerySchema,
} from '@njangi/shared/contracts/developer';
import { floodLimits, rateLimit } from '../../http/rate-limit';
import { handle } from '../../http/validate';
import { developerOf, requireDeveloper } from './developer.auth';
import { loginDeveloper } from './developer.login';
import {
  closeGroup,
  deleteUser,
  getGroup,
  getUser,
  listGroups,
  listUsers,
} from './developer.service';

export function developerRoutes(): Router {
  const router = Router();
  router.use((_req, res, next) => {
    // Full phone numbers and account details: never cached by a browser or a proxy.
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.post(
    '/login',
    rateLimit(floodLimits.auth),
    handle({ body: developerLoginRequestSchema }, async ({ body }, req, res) => {
      res.json({ session: await loginDeveloper(body, req.ip ?? 'unknown') });
    }),
  );

  router.use(requireDeveloper());

  router.get(
    '/users',
    handle({ query: developerUsersQuerySchema }, async ({ query }, _req, res) => {
      res.json(await listUsers(query));
    }),
  );

  router.get(
    '/users/:id',
    handle({ params: developerIdParamsSchema }, async ({ params }, _req, res) => {
      res.json({ user: await getUser(params.id) });
    }),
  );

  router.delete(
    '/users/:id',
    handle({ params: developerIdParamsSchema }, async ({ params }, req, res) => {
      res.json({ user: await deleteUser(params.id, developerOf(req).username) });
    }),
  );

  router.get(
    '/groups',
    handle({ query: developerGroupsQuerySchema }, async ({ query }, _req, res) => {
      res.json(await listGroups(query));
    }),
  );

  router.get(
    '/groups/:id',
    handle({ params: developerIdParamsSchema }, async ({ params }, _req, res) => {
      res.json({ group: await getGroup(params.id) });
    }),
  );

  router.post(
    '/groups/:id/close',
    handle({ params: developerIdParamsSchema }, async ({ params }, req, res) => {
      res.json({ group: await closeGroup(params.id, developerOf(req).username) });
    }),
  );

  return router;
}
