// Audit export route (spec 2.7 Ledger, 2.14):
//   GET /v1/groups/:groupId/ledger/export?format=json|csv   the whole ledger as a file (json by default)
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { auditExportQuerySchema } from '@njangi/shared/contracts/statements';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { buildLedgerCsv, buildLedgerExport } from './audit-export.service';

const groupParams = z.strictObject({ groupId: uuidSchema });

export function auditExportRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/:groupId/ledger/export',
    handle(
      { params: groupParams, query: auditExportQuerySchema },
      async ({ params, query }, req, res) => {
        const userId = actorOf(req).userId;
        // The file is built first: a refusal must answer as an error, not as a download.
        const csv = query.format === 'csv';
        const file = csv
          ? await buildLedgerCsv(userId, params.groupId)
          : await buildLedgerExport(userId, params.groupId);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="ledger-${params.groupId}.${csv ? 'csv' : 'json'}"`,
        );
        if (csv) res.type('text/csv; charset=utf-8').send(file);
        else res.json(file);
      },
    ),
  );

  return router;
}
