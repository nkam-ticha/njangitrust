// Statement routes (spec 2.7 Me and Verification, 2.14):
//   GET  /v1/me/statements?groupId=       my statements, newest first
//   POST /v1/me/statements                creates my statement for a period if needed
//   GET  /v1/me/statements/:statementId   the statement and a signed URL of its PDF (5 minutes)
//   GET  /v1/verify/:code                 public and rate-limited: genuine or not, period, issue date
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import {
  createStatementRequestSchema,
  statementListQuerySchema,
} from '@njangi/shared/contracts/statements';
import { actorOf, requireAuth } from '../../http/auth';
import { lazyLimiter, rateLimit } from '../../http/rate-limit';
import { handle } from '../../http/validate';
import {
  createStatement,
  getStatementDownload,
  listStatements,
  verifyStatement,
} from './statements.service';

const statementParams = z.strictObject({ statementId: uuidSchema });
const verifyParams = z.strictObject({ code: z.string().min(1).max(64) });

/** 2.14: codes cannot be guessed in bulk: 30 checks per address every 5 minutes. */
export const verifyLimiter = lazyLimiter(
  { name: 'statement-verify-ip', points: 30, durationSeconds: 300 },
  { scaled: true },
);

export function meStatementRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/',
    handle({ query: statementListQuerySchema }, async ({ query }, req, res) => {
      res.json({ statements: await listStatements(actorOf(req).userId, query.groupId) });
    }),
  );

  router.post(
    '/',
    handle({ body: createStatementRequestSchema }, async ({ body }, req, res) => {
      res.status(201).json({ statement: await createStatement(actorOf(req).userId, body) });
    }),
  );

  router.get(
    '/:statementId',
    handle({ params: statementParams }, async ({ params }, req, res) => {
      res.json(await getStatementDownload(actorOf(req).userId, params.statementId));
    }),
  );

  return router;
}

/** Unauthenticated: a bank types the code printed on a statement. */
export function verifyRoutes(): Router {
  const router = Router();
  router.get(
    '/:code',
    rateLimit(verifyLimiter),
    handle({ params: verifyParams }, async ({ params }, _req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json(await verifyStatement(params.code));
    }),
  );
  return router;
}
