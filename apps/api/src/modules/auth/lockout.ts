// PIN attempt counters (spec 2.10, D7: in Redis). Five wrong PINs lock for 15 minutes, counted
// per phone for login (known or not, so the lockout itself reveals nothing) and per member for
// PIN-protected actions. Keys never contain a phone number in clear.
import { RateLimiterRes } from 'rate-limiter-flexible';
import { hashPhone } from '../../lib/crypto';
import { lazyLimiter, retryAfterSeconds, type LazyLimiter } from '../../http/rate-limit';

export const MAX_PIN_ATTEMPTS = 5;
export const LOCK_SECONDS = 15 * 60;

const policy = (name: string) => ({
  name,
  points: MAX_PIN_ATTEMPTS,
  durationSeconds: LOCK_SECONDS,
  blockSeconds: LOCK_SECONDS,
});

export const loginAttempts = lazyLimiter(policy('login-pin'));
export const actionPinAttempts = lazyLimiter(policy('action-pin'));
/** Wrong phone numbers typed on one reset link. */
export const resetLinkAttempts = lazyLimiter(policy('reset-link'));

export const loginKey = (phone: string) => `p:${hashPhone(phone)}`;

export interface LockState {
  locked: boolean;
  retryAfterSeconds: number;
}

export async function lockState(limiter: LazyLimiter, key: string): Promise<LockState> {
  const res = await limiter.get().get(key);
  if (!res || res.consumedPoints < MAX_PIN_ATTEMPTS) return { locked: false, retryAfterSeconds: 0 };
  return { locked: true, retryAfterSeconds: retryAfterSeconds(res) };
}

/** Counts one wrong PIN. The fifth locks for a full 15 minutes from now. */
export async function recordFailure(
  limiter: LazyLimiter,
  key: string,
): Promise<{ attemptsLeft: number; locked: boolean; retryAfterSeconds: number }> {
  try {
    const res = await limiter.get().consume(key);
    if (res.remainingPoints > 0) {
      return { attemptsLeft: res.remainingPoints, locked: false, retryAfterSeconds: 0 };
    }
    await limiter.get().block(key, LOCK_SECONDS);
    return { attemptsLeft: 0, locked: true, retryAfterSeconds: LOCK_SECONDS };
  } catch (error) {
    if (error instanceof RateLimiterRes) {
      return { attemptsLeft: 0, locked: true, retryAfterSeconds: retryAfterSeconds(error) };
    }
    throw error;
  }
}

export async function clearFailures(limiter: LazyLimiter, key: string): Promise<void> {
  await limiter.get().delete(key);
}

export const lockMinutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));
