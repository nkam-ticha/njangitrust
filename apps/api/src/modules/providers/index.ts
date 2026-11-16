export type { PaymentProvider, ProviderStatus } from './payment-provider';
export { MockProvider } from './mock-provider';

import { getEnv } from '../../config/env';
import { getPrisma } from '../../lib/prisma';
import type { PaymentProvider } from './payment-provider';
import { MockProvider } from './mock-provider';
import { CAMPAY_BASE_URLS, CampayProvider } from './campay-provider';

export { CampayError, CampayProvider } from './campay-provider';
export { campayWebhookRoutes, registerCampayRechecks } from './campay-webhook';

let provider: PaymentProvider | undefined;

/** What the mock operator holds: every confirmed collection less its fee, less every confirmed
 * send and its fee. Read from the operations, so it is the same in every server process. */
async function mockSettledBalance(providerAccount: string): Promise<number> {
  const db = getPrisma();
  const [collected, sent] = await Promise.all([
    db.paymentIntent.aggregate({
      where: { provider: 'mock', status: 'SUCCESSFUL', group: { providerAccount } },
      _sum: { amount: true, fee: true },
    }),
    db.disbursement.aggregate({
      where: { provider: 'mock', status: 'SUCCESSFUL', group: { providerAccount } },
      _sum: { amount: true, feeActual: true },
    }),
  ]);
  return (
    (collected._sum.amount ?? 0) -
    (collected._sum.fee ?? 0) -
    (sent._sum.amount ?? 0) -
    (sent._sum.feeActual ?? 0)
  );
}

/** One provider instance per server process, preserving MockProvider's idempotency state. */
export function getPaymentProvider(): PaymentProvider {
  if (provider) return provider;
  const env = getEnv();
  if (env.PAYMENT_PROVIDER === 'mock') provider = new MockProvider(mockSettledBalance);
  else {
    provider = new CampayProvider({
      baseUrl: CAMPAY_BASE_URLS[env.CAMPAY_ENV],
      accessToken: env.CAMPAY_ACCESS_TOKEN,
      username: env.CAMPAY_USERNAME,
      password: env.CAMPAY_PASSWORD,
    });
  }
  return provider;
}

export function resetPaymentProviderForTests(): void {
  provider = undefined;
}
