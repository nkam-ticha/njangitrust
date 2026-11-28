// The member's own account. Routes only validate, ask the service for a card and map it; the member
// confirms the card with their PIN (POST /pending-actions/:id/confirm).
//   POST /v1/me/payment-number     body { number, operator? }  card: change my payment number (R13)
//   POST /v1/me/account-deletion   card: delete my account (PRV-03)
//   GET  /v1/me/data-export        my personal data as one JSON document, 5 an hour (PRV-03, D34)
import { Router } from 'express';
import { z } from 'zod';
import { actorOf, requireAuth } from '../../http/auth';
import { consumeOrThrow, lazyLimiter } from '../../http/rate-limit';
import { handle } from '../../http/validate';
import { toPendingAction } from '../../dto';
import { exportMyData } from './account.export';
import { requestChangePaymentNumber, requestDeleteAccount } from './account.service';

const changeBody = z.strictObject({
  number: z.string().trim().min(8).max(20),
  operator: z.enum(['MTN', 'ORANGE']).optional(),
});

/** The export reads a lot of rows: five a member and hour is plenty for a file people keep. */
const exportLimiter = lazyLimiter({ name: 'data-export-user', points: 5, durationSeconds: 3600 });

export function accountRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.post(
    '/payment-number',
    handle({ body: changeBody }, async ({ body }, req, res) => {
      const action = await requestChangePaymentNumber(actorOf(req), body);
      res.status(201).json({ action: toPendingAction(action) });
    }),
  );

  router.post(
    '/account-deletion',
    handle({}, async (_input, req, res) => {
      const action = await requestDeleteAccount(actorOf(req));
      res.status(201).json({ action: toPendingAction(action) });
    }),
  );

  router.get(
    '/data-export',
    handle({}, async (_input, req, res) => {
      const { userId } = actorOf(req);
      await consumeOrThrow(exportLimiter, userId, res);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ export: await exportMyData(userId) });
    }),
  );

  return router;
}
