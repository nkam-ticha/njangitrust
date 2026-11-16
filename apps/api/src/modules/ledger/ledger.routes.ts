import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { TRANSACTION_TYPES } from '@njangi/rules';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { readFunds, readLedger, readLedgerEntry } from './ledger.read';

const groupParams = z.strictObject({ groupId: uuidSchema });
const entryParams = groupParams.extend({ seq: z.coerce.number().int().positive() });
const query = z
  .strictObject({
    before: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    membershipId: uuidSchema.optional(),
    type: z.enum(TRANSACTION_TYPES).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'from must be before to',
  });

export function ledgerRoutes(): Router {
  const router = Router();
  router.use(requireAuth());
  router.get(
    '/:groupId/ledger',
    handle({ params: groupParams, query }, async ({ params, query: q }, req, res) => {
      res.json(await readLedger(actorOf(req).userId, params.groupId, q));
    }),
  );
  router.get(
    '/:groupId/ledger/:seq',
    handle({ params: entryParams }, async ({ params }, req, res) => {
      res.json({ entry: await readLedgerEntry(actorOf(req).userId, params.groupId, params.seq) });
    }),
  );
  router.get(
    '/:groupId/funds',
    handle({ params: groupParams }, async ({ params }, req, res) => {
      res.json({ funds: await readFunds(actorOf(req).userId, params.groupId) });
    }),
  );
  return router;
}
