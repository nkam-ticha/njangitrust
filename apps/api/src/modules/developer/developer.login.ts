// The developer login (D28). Credentials come from the environment: a username and an argon2id
// hash. The username is compared in constant time and the password hash is always checked (against
// a dummy when nothing is configured), so the answer and its timing say nothing about which part
// was wrong. Five failures from one address lock it for 15 minutes; a higher total across every
// address stops a guessing campaign without letting an attacker lock the owner out for good.
import { getEnv } from '../../config/env';
import { lazyLimiter, retryAfterSeconds, type LazyLimiter } from '../../http/rate-limit';
import { audit } from '../audit';
import { burnPinCheck, clearFailures, LOCK_SECONDS, recordFailure, verifyPin } from '../auth';
import { developerError } from './developer.errors';
import { sameText, signDeveloperToken } from './developer.auth';

const POINTS_PER_ADDRESS = 5;
const POINTS_IN_TOTAL = 30;
const policy = (name: string, points: number) => ({
  name,
  points,
  durationSeconds: LOCK_SECONDS,
  blockSeconds: LOCK_SECONDS,
});

export const developerLoginByAddress = lazyLimiter(
  policy('developer-login-ip', POINTS_PER_ADDRESS),
);
export const developerLoginInTotal = lazyLimiter(policy('developer-login-all', POINTS_IN_TOTAL));
const TOTAL_KEY = 'all';

async function lockedSeconds(limiter: LazyLimiter, key: string, points: number): Promise<number> {
  const state = await limiter.get().get(key);
  if (!state || state.consumedPoints < points) return 0;
  return retryAfterSeconds(state);
}

export interface DeveloperLoginResult {
  token: string;
  expiresAt: string;
}

export async function loginDeveloper(
  input: { username: string; password: string },
  address: string,
): Promise<DeveloperLoginResult> {
  const waits = await Promise.all([
    lockedSeconds(developerLoginByAddress, address, POINTS_PER_ADDRESS),
    lockedSeconds(developerLoginInTotal, TOTAL_KEY, POINTS_IN_TOTAL),
  ]);
  const wait = Math.max(...waits);
  if (wait > 0) {
    throw developerError('DEVELOPER_LOCKED', {
      params: { minutes: Math.max(1, Math.ceil(wait / 60)) },
      details: { retryAfterSeconds: wait },
    });
  }

  const env = getEnv();
  const { DEVELOPER_USERNAME: username, DEVELOPER_PASSWORD_HASH: hash } = env;
  let ok = false;
  if (username && hash) {
    const nameOk = sameText(input.username, username);
    const passwordOk = await verifyPin(hash, input.password);
    ok = nameOk && passwordOk;
  } else {
    await burnPinCheck(input.password);
  }

  if (!ok) {
    const byAddress = await recordFailure(developerLoginByAddress, address);
    await recordFailure(developerLoginInTotal, TOTAL_KEY);
    await audit({
      action: byAddress.locked ? 'developer.login.locked' : 'developer.login.failed',
      actorUserId: null,
    });
    throw developerError('DEVELOPER_LOGIN_INVALID');
  }

  // `ok` means the typed name equals the configured one: the audit and the token carry the
  // configured name, never text from the request.
  const developer = username ?? '';
  await clearFailures(developerLoginByAddress, address);
  await audit({
    action: 'developer.login.succeeded',
    actorUserId: null,
    details: { developer },
  });
  const session = await signDeveloperToken(developer);
  return { token: session.token, expiresAt: session.expiresAt.toISOString() };
}
