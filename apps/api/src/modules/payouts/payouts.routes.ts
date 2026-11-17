// Withdrawal endpoints return confirmation cards; the member starts the provider operation only
// after confirming them (spec 2.7, 4.5).
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { toPendingAction } from '../../dto';
import { createPendingAction } from '../pending-actions';
import { getOwnWithdrawal, readMyMoney } from './withdrawals.service';

const groupParams = z.strictObject({ groupId: uuidSchema });
const withdrawalParams = z.strictObject({ withdrawalId: uuidSchema });
const request = z.strictObject({
  amount: z.union([z.number().int().positive(), z.literal('ALL')]),
});

export function payoutRoutes(): Router {
  const router = Router();
  router.use(requireAuth());
  // The member's own money in the group (spec 2.7 Money): read-only; the withdrawal card is a POST.
  router.get(
    '/:groupId/me/money',
    handle({ params: groupParams }, async ({ params }, req, res) => {
      const money = await readMyMoney(actorOf(req).userId, params.groupId);
      res.json({
        money: {
          available: money.available,
          locked: money.locked,
          unlocksAt: money.unlocksAt?.toISOString() ?? null,
          debtsDue: money.debtsDue,
          hold: money.hold
            ? { reason: money.hold.reason, until: money.hold.until.toISOString() }
            : null,
          withdrawalsPaused: money.withdrawalsPaused,
          withdrawalInProgress: money.withdrawalInProgress,
        },
      });
    }),
  );
  router.post(
    '/:groupId/withdrawals',
    handle({ params: groupParams, body: request }, async ({ params, body }, req, res) => {
      const actor = actorOf(req);
      const action = await createPendingAction({
        userId: actor.userId,
        groupId: params.groupId,
        lang: actor.lang,
        origin: 'UI',
        type: 'WITHDRAW',
        args: { groupId: params.groupId, amount: body.amount },
      });
      res.status(201).json({ action: toPendingAction(action) });
    }),
  );
  return router;
}

export function withdrawalRoutes(): Router {
  const router = Router();
  router.use(requireAuth());
  router.get(
    '/:withdrawalId',
    handle({ params: withdrawalParams }, async ({ params }, req, res) => {
      res.json({ withdrawal: await getOwnWithdrawal(actorOf(req).userId, params.withdrawalId) });
    }),
  );
  return router;
}
