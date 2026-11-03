// Invites (spec 2.7, 2.10):
//   POST /v1/groups/:groupId/invites            admin; returns an INVITE_CREATE card to confirm
//   GET  /v1/groups/:groupId/invites            admin; names and statuses, never a phone
//   GET  /v1/auth/invites/:token                public; group, inviter, current rules (R1.5)
//   POST /v1/auth/invites/:token/accept         sign up, or join as a logged-in member
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { acceptInviteRequestSchema, createInviteRequestSchema } from '@njangi/shared/contracts/invites';
import { actorOf, optionalAuth, requireAuth } from '../../http/auth';
import { floodLimits, rateLimit } from '../../http/rate-limit';
import { deliverSession } from '../../http/session-delivery';
import { handle } from '../../http/validate';
import { toGroup, toInviteListItem, toInvitePreview, toMyMembership, toPendingAction, toSelf } from '../../dto';
import { clock } from '../../lib/clock';
import { getSelfSource } from '../me';
import { acceptInvite, listInvites, previewInvite, requestInvite } from './invites.service';

const groupParams = z.strictObject({ groupId: uuidSchema });
const tokenParams = z.strictObject({ token: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/) });

export function inviteGroupRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.post(
    '/:groupId/invites',
    handle({ params: groupParams, body: createInviteRequestSchema }, async ({ params, body }, req, res) => {
      const action = await requestInvite(actorOf(req), params.groupId, body);
      res.status(201).json({ action: toPendingAction(action) });
    }),
  );

  router.get(
    '/:groupId/invites',
    handle({ params: groupParams }, async ({ params }, req, res) => {
      const invites = await listInvites(actorOf(req).userId, params.groupId);
      const now = clock.now();
      res.json({ invites: invites.map((i) => toInviteListItem(i, now)) });
    }),
  );

  return router;
}

export function invitePublicRoutes(): Router {
  const router = Router();
  router.use(rateLimit(floodLimits.auth));

  router.get(
    '/:token',
    handle({ params: tokenParams }, async ({ params }, _req, res) => {
      res.json({ invite: toInvitePreview(await previewInvite(params.token)) });
    }),
  );

  router.post(
    '/:token/accept',
    optionalAuth(),
    handle({ params: tokenParams, body: acceptInviteRequestSchema }, async ({ params, body }, req, res) => {
      const accepted = await acceptInvite(params.token, body, req.actor, req.clientKind);
      res.status(201).json({
        group: toGroup(accepted.group, accepted.memberCount),
        me: toMyMembership(accepted.membership),
        ...(accepted.session
          ? { user: toSelf(await getSelfSource(accepted.userId)), session: deliverSession(req, res, accepted.session) }
          : {}),
      });
    }),
  );

  return router;
}
