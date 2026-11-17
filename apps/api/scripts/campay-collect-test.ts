// One small collection on CamPay's demo environment, to check the whole round trip with a real
// phone: the owner of the number approves it on the handset. It never sends money out.
// Run from apps/api: tsx --env-file=.env scripts/campay-collect-test.ts <number> [amount]
import { randomUUID } from 'node:crypto';
import { maskNumber, normalizeCameroonPhone } from '@njangi/shared';
import { getEnv } from '../src/config/env';
import {
  CAMPAY_BASE_URLS,
  CampayError,
  CampayProvider,
} from '../src/modules/providers/campay-provider';

const MAX_TEST_AMOUNT = 100;
const POLL_MS = 5_000;
const POLLS = 30;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const env = getEnv();
  if (env.CAMPAY_ENV !== 'DEV') throw new Error('This test only runs with CAMPAY_ENV=DEV.');
  const phone = normalizeCameroonPhone(process.argv[2] ?? '');
  if (!phone) throw new Error('Give a Cameroon mobile number, for example 6XXXXXXXX.');
  const amount = Number(process.argv[3] ?? 25);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_TEST_AMOUNT) {
    throw new Error(`The amount must be a whole number from 1 to ${MAX_TEST_AMOUNT} FCFA.`);
  }
  const provider = new CampayProvider({
    baseUrl: CAMPAY_BASE_URLS.DEV,
    accessToken: env.CAMPAY_ACCESS_TOKEN,
    username: env.CAMPAY_USERNAME,
    password: env.CAMPAY_PASSWORD,
  });
  console.log(`Balance before: ${(await provider.getBalance()).total} XAF`);
  const { providerRef } = await provider.requestPayment({
    amount,
    phone,
    externalRef: randomUUID(),
    description: 'NjangiTrust test',
  });
  console.log(`Asked ${amount} XAF from ${maskNumber(phone)}. Approve it on the phone.`);
  let status = 'PENDING';
  for (let i = 0; i < POLLS && status === 'PENDING'; i++) {
    await sleep(POLL_MS);
    const answer = await provider.getPaymentStatus(providerRef);
    status = answer.status;
    console.log(
      `  ${(i + 1) * (POLL_MS / 1000)} s: ${status}${answer.operator ? ` (${answer.operator})` : ''}`,
    );
  }
  console.log(`Result: ${status}`);
  console.log(`Balance after: ${(await provider.getBalance()).total} XAF`);
}

main().catch((error: unknown) => {
  const text = error instanceof CampayError ? `CamPay refused: ${error.code}` : String(error);
  console.error(text);
  process.exitCode = 1;
});
