import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { getEnv } from '../../config/env';
import { commonError } from '../../lib/errors';
import { handle } from '../../http/validate';
import { recordDisbursementRefund } from './withdrawals.service';

function authorized(header: string | undefined, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7), 'utf8');
  const expected = Buffer.from(secret, 'utf8');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** Trusted operator callback: this records a refund already confirmed with the payment operator. */
export function operatorRefundRoutes(): Router {
  const router = Router();
  router.post(
    '/disbursements/:disbursementId/refund',
    handle(
      {
        params: z.strictObject({ disbursementId: uuidSchema }),
        body: z.strictObject({
          feeKept: z.number().int().nonnegative(),
          reason: z.string().trim().min(8).max(240),
        }),
      },
      async ({ params, body }, req, res) => {
        if (!authorized(req.get('authorization'), getEnv().DISBURSEMENT_REFUND_SECRET))
          throw commonError('UNAUTHENTICATED');
        const result = await recordDisbursementRefund({
          disbursementId: params.disbursementId,
          feeKept: body.feeKept,
          reason: body.reason,
        });
        res.status(result.alreadyRecorded ? 200 : 201).json({ refunded: true, ...result });
      },
    ),
  );
  return router;
}
