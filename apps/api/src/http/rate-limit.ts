// Rate limits (spec 4.2, Phase 9) with rate-limiter-flexible. In the server they live in Redis,
// with an in-memory insurance limiter if Redis fails; in tests they are in memory.
import type { Redis } from 'ioredis';
import type { Request, RequestHandler, Response } from 'express';
import {
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes,
  type RateLimiterAbstract,
} from 'rate-limiter-flexible';
import { AppError, commonError } from '../lib/errors';

export interface LimitPolicy {
  /** Unique per limiter: `login-ip`, `pin-lockout`, ... */
  name: string;
  points: number;
  durationSeconds: number;
  /** Once exhausted, block for this long (defaults to the rest of the window). */
  blockSeconds?: number;
}

let redisStore: Redis | null = null;
let testScale = 1;

/** Server start-up: keep counters in Redis (shared by every API process). */
export function useRedisForRateLimits(client: Redis): void {
  redisStore = client;
}

/** Tests only: multiplies the points of scaled limiters so suites don't trip the IP limits. */
export function setRateLimitScaleForTests(scale: number): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('test only');
  testScale = scale;
}

function build(policy: LimitPolicy, scaled: boolean): RateLimiterAbstract {
  const options = {
    keyPrefix: `njangi:rl:${policy.name}`,
    points: scaled ? policy.points * testScale : policy.points,
    duration: policy.durationSeconds,
    blockDuration: policy.blockSeconds ?? 0,
  };
  const memory = new RateLimiterMemory(options);
  if (!redisStore) return memory;
  return new RateLimiterRedis({ ...options, storeClient: redisStore, insuranceLimiter: memory });
}

/**
 * A limiter created on first use (after the server has chosen its store). `scaled` limiters
 * protect against floods and are relaxed in tests; security limiters (PIN attempts) never are.
 */
export function lazyLimiter(policy: LimitPolicy, options: { scaled?: boolean } = {}) {
  let limiter: RateLimiterAbstract | undefined;
  let builtWithScale = testScale;
  const get = (): RateLimiterAbstract => {
    if (!limiter || builtWithScale !== testScale) {
      limiter = build(policy, options.scaled ?? false);
      builtWithScale = testScale;
    }
    return limiter;
  };
  return {
    policy,
    get,
    /** Forgets every key's counter: the next use starts afresh (tests only). */
    resetAllForTests(): void {
      limiter = undefined;
    },
  };
}

export type LazyLimiter = ReturnType<typeof lazyLimiter>;

export function retryAfterSeconds(res: RateLimiterRes): number {
  return Math.max(1, Math.ceil(res.msBeforeNext / 1000));
}

/** Consumes one point for `key`, or throws RATE_LIMITED with a Retry-After. */
export async function consumeOrThrow(limiter: LazyLimiter, key: string, res?: Response): Promise<void> {
  try {
    await limiter.get().consume(key);
  } catch (error) {
    if (error instanceof RateLimiterRes) {
      const seconds = retryAfterSeconds(error);
      res?.setHeader('Retry-After', String(seconds));
      throw commonError('RATE_LIMITED', { params: { seconds }, details: { retryAfterSeconds: seconds } });
    }
    if (error instanceof AppError) throw error;
    throw commonError('SERVICE_UNAVAILABLE');
  }
}

/** Express middleware limiting by client IP (or another key). */
export function rateLimit(
  limiter: LazyLimiter,
  keyOf: (req: Request) => string = (req) => req.ip ?? 'unknown',
): RequestHandler {
  return async (req, res, next) => {
    await consumeOrThrow(limiter, keyOf(req), res);
    next();
  };
}

/** Flood limits shared by the routes (scaled in tests). */
export const floodLimits = {
  /** Every request, per IP. */
  global: lazyLimiter({ name: 'global-ip', points: 600, durationSeconds: 60 }, { scaled: true }),
  /** Sign-up, login, PIN reset, invite acceptance, per IP. */
  auth: lazyLimiter({ name: 'auth-ip', points: 30, durationSeconds: 300 }, { scaled: true }),
  /** Token refresh, per IP. */
  refresh: lazyLimiter({ name: 'refresh-ip', points: 120, durationSeconds: 300 }, { scaled: true }),
};
