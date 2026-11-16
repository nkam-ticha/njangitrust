// CamPay's callback (spec 2.6.4). CamPay calls it, by GET or POST, when an operation becomes
// SUCCESSFUL or FAILED. The callback is only a prompt: after its signature is checked, the status is
// asked again from CamPay by the usual status check, which is the only thing that changes the
// ledger. So a forged, repeated or late callback can never record a payment.
import { Router, type Request, type RequestHandler } from 'express';
import { jwtVerify } from 'jose';
import { getEnv } from '../../config/env';
import { commonError } from '../../lib/errors';
import { componentLogger } from '../../lib/logger';
import { getPrisma } from '../../lib/prisma';

const log = componentLogger('campay-webhook');

type Recheck = (id: string) => Promise<void>;
let recheckPayment: Recheck | null = null;
let recheckDisbursement: Recheck | null = null;

/** Start-up: the payment and payout modules give their status checks (avoids an import cycle). */
export function registerCampayRechecks(checks: { payment: Recheck; disbursement: Recheck }): void {
  recheckPayment = checks.payment;
  recheckDisbursement = checks.disbursement;
}

function field(req: Request, name: string): string | null {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const value = req.query[name] ?? body[name];
  return typeof value === 'string' && value.length <= 4_096 ? value : null;
}

/** True when `signature` is a JWT signed by CamPay with this app's webhook key (HS256). */
export async function isCampaySignature(signature: string, webhookKey: string): Promise<boolean> {
  try {
    await jwtVerify(signature, new TextEncoder().encode(webhookKey), { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}

/** Runs the status check of the operation CamPay names. Returns what kind it was, or null. */
export async function recheckCampayOperation(
  reference: string,
): Promise<'payment' | 'disbursement' | null> {
  const db = getPrisma();
  const payment = await db.paymentIntent.findUnique({
    where: { providerRef: reference },
    select: { id: true, provider: true },
  });
  if (payment?.provider === 'campay' && recheckPayment) {
    await recheckPayment(payment.id);
    return 'payment';
  }
  const disbursement = await db.disbursement.findUnique({
    where: { providerRef: reference },
    select: { id: true, provider: true },
  });
  if (disbursement?.provider === 'campay' && recheckDisbursement) {
    await recheckDisbursement(disbursement.id);
    return 'disbursement';
  }
  return null;
}

export function campayWebhookRoutes(
  webhookKey: () => string | undefined = () => getEnv().CAMPAY_WEBHOOK_KEY,
): Router {
  const router = Router();
  const receive: RequestHandler = async (req, res) => {
    const key = webhookKey();
    const signature = field(req, 'signature');
    const reference = field(req, 'reference');
    if (!key || !signature || !(await isCampaySignature(signature, key))) {
      throw commonError('UNAUTHENTICATED');
    }
    if (reference && /^[A-Za-z0-9-]{8,64}$/.test(reference)) {
      const kind = await recheckCampayOperation(reference);
      log.info({ kind: kind ?? 'unknown' }, 'CamPay callback received');
    }
    // Always the same answer for a signed callback: it says nothing about what we hold.
    res.json({ received: true });
  };
  router.get('/', receive);
  router.post('/', receive);
  return router;
}
