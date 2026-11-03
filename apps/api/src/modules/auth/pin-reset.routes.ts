// Group side of PIN resets (spec 2.10, D8):
//   GET  /v1/groups/:groupId/pin-resets               requests the viewer may confirm
//   POST /v1/groups/:groupId/pin-resets/:id/approvals  prepares a PIN_RESET_APPROVE card (L2)
//   POST /v1/groups/:groupId/pin-resets/:id/decline    "Je ne reconnais pas cette demande"
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import type { PinResetRequestItem } from '@njangi/shared/contracts/auth';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { iso, toPendingAction } from '../../dto';
import { authorizeGroup } from '../../permissions';
import { createPendingAction } from '../pending-actions';
import { listReviewable, type ReviewState } from './pin-reset.review';
import { declinePinReset } from './pin-reset.service';

const groupParams = z.strictObject({ groupId: uuidSchema });
const resetParams = z.strictObject({ groupId: uuidSchema, id: uuidSchema });

function toItem(review: ReviewState): PinResetRequestItem {
  return {
    id: review.pinResetId,
    memberName: review.requesterName,
    membershipId: review.requesterMembershipId,
    requestedAt: iso(review.requestedAt),
    expiresAt: iso(review.requestExpiresAt),
    confirmationsNeeded: review.needed,
    confirmationsGiven: review.given,
    confirmedByMe: review.confirmedByMe,
  };
}

export function pinResetGroupRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/:groupId/pin-resets',
    handle({ params: groupParams }, async ({ params }, req, res) => {
      const reviews = await listReviewable(actorOf(req).userId, params.groupId);
      res.json({ requests: reviews.map(toItem) });
    }),
  );

  router.post(
    '/:groupId/pin-resets/:id/approvals',
    handle({ params: resetParams }, async ({ params }, req, res) => {
      const actor = actorOf(req);
      await authorizeGroup(actor.userId, params.groupId, 'group.pinResets.review');
      const action = await createPendingAction({
        userId: actor.userId,
        groupId: params.groupId,
        lang: actor.lang,
        origin: 'UI',
        type: 'PIN_RESET_APPROVE',
        args: { pinResetId: params.id, groupId: params.groupId },
      });
      res.status(201).json({ action: toPendingAction(action) });
    }),
  );

  router.post(
    '/:groupId/pin-resets/:id/decline',
    handle({ params: resetParams }, async ({ params }, req, res) => {
      await declinePinReset(actorOf(req).userId, params.groupId, params.id);
      res.status(204).end();
    }),
  );

  return router;
}
