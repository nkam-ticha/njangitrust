import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { toPendingAction } from '../../dto';
import {
  getLoanQuote,
  listLoans,
  requestLoan,
  requestLoanDecision,
  requestLoanRepayment,
} from './loans.service';

const groupParams = z.strictObject({ groupId: uuidSchema });
const loanParams = z.strictObject({ loanId: uuidSchema });
const quoteBody = z.strictObject({
  amount: z.number().int().positive(),
  months: z.number().int().min(1).max(6),
});
const decisionBody = z.strictObject({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().min(1).max(500),
});
const repaymentBody = z.strictObject({
  amount: z.union([z.number().int().positive(), z.literal('ALL')]).optional(),
});

export function loanGroupRoutes(): Router {
  const router = Router();
  router.use(requireAuth());
  router.get(
    '/:groupId/loans',
    handle({ params: groupParams }, async ({ params }, req, res) => {
      res.json({ loans: await listLoans(actorOf(req).userId, params.groupId) });
    }),
  );
  router.post(
    '/:groupId/loans/quote',
    handle({ params: groupParams, body: quoteBody }, async ({ params, body }, req, res) => {
      res.json({ quote: await getLoanQuote(actorOf(req).userId, params.groupId, body) });
    }),
  );
  router.post(
    '/:groupId/loans',
    handle({ params: groupParams, body: quoteBody }, async ({ params, body }, req, res) => {
      const action = await requestLoan(actorOf(req), params.groupId, body);
      res.status(201).json({ action: toPendingAction(action) });
    }),
  );
  return router;
}

export function loanDecisionRoutes(): Router {
  const router = Router();
  router.use(requireAuth());
  router.post(
    '/:loanId/decision',
    handle({ params: loanParams, body: decisionBody }, async ({ params, body }, req, res) => {
      const action = await requestLoanDecision(actorOf(req), params.loanId, body);
      res.status(201).json({ action: toPendingAction(action) });
    }),
  );
  router.post(
    '/:loanId/repayments',
    handle({ params: loanParams, body: repaymentBody }, async ({ params, body }, req, res) => {
      const action = await requestLoanRepayment(actorOf(req), params.loanId, body.amount ?? 'NEXT');
      res.status(201).json({ action: toPendingAction(action) });
    }),
  );
  return router;
}
