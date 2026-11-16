// Checks the CamPay settings of apps/api/.env against CamPay itself: reads the balance, which moves
// no money. Run: pnpm campay:check
import { getEnv } from '../src/config/env';
import {
  CAMPAY_BASE_URLS,
  CampayError,
  CampayProvider,
} from '../src/modules/providers/campay-provider';

async function main(): Promise<void> {
  const env = getEnv();
  const baseUrl = CAMPAY_BASE_URLS[env.CAMPAY_ENV];
  const ways = [
    ['permanent access token', { accessToken: env.CAMPAY_ACCESS_TOKEN }],
    ['username and password', { username: env.CAMPAY_USERNAME, password: env.CAMPAY_PASSWORD }],
  ] as const;
  let ok = false;
  for (const [name, credentials] of ways) {
    if (!Object.values(credentials).every(Boolean)) {
      console.log(`${name}: not set`);
      continue;
    }
    try {
      const balance = await new CampayProvider({ baseUrl, ...credentials }).getBalance();
      console.log(`${name}: accepted by ${baseUrl} (balance ${balance.total} XAF)`);
      ok = true;
    } catch (error) {
      const code = error instanceof CampayError ? error.code : 'ERROR';
      console.log(`${name}: refused by ${baseUrl} (${code})`);
    }
  }
  console.log(`webhook key: ${env.CAMPAY_WEBHOOK_KEY ? 'set' : 'not set'}`);
  process.exitCode = ok ? 0 : 1;
}

void main();
