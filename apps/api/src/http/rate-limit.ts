// Shared PostgreSQL rate limits. Memory is retained only for tests/development.
import type { Request, RequestHandler, Response } from 'express';
import type { Redis } from 'ioredis';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { clock } from '../lib/clock';
import { AppError, commonError } from '../lib/errors';
import { getPrisma } from '../lib/prisma';

export interface LimitPolicy {
  name: string;
  points: number;
  durationSeconds: number;
  blockSeconds?: number;
}
type Result = { remainingPoints: number; consumedPoints: number; msBeforeNext: number };
type PgLimiter = {
  consume(key: string): Promise<Result>;
  get(key: string): Promise<Result | null>;
  delete(key: string): Promise<void>;
  block(key: string, seconds: number): Promise<void>;
};
let testScale = 1;
/** Legacy startup hook retained for server.ts compatibility; PostgreSQL is authoritative. */
export function useRedisForRateLimits(_client: Redis): void {
  /* intentionally unused */
}
export function setRateLimitScaleForTests(scale: number): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('test only');
  testScale = scale;
}

type LimitRow = { consumed: number; expires: Date; blocked: Date | null };

export function postgresLimiter(policy: LimitPolicy, points: number): PgLimiter {
  const prefix = `njangi:rl:${policy.name}:`;
  const durationMs = policy.durationSeconds * 1000;
  const blockMs = (policy.blockSeconds ?? 0) * 1000;
  const read = async (key: string): Promise<Result | null> => {
    const id = prefix + key;
    const rows = await getPrisma().$queryRaw<LimitRow[]>`
      SELECT "consumed", "expiresAt" AS "expires", "blockedUntil" AS "blocked"
      FROM "RateLimitRecord" WHERE "key" = ${id}`;
    const row = rows[0];
    if (!row) return null;
    const now = clock.nowMs();
    if (row.expires.getTime() <= now && (!row.blocked || row.blocked.getTime() <= now)) return null;
    return {
      consumedPoints: row.consumed,
      remainingPoints: Math.max(0, points - row.consumed),
      msBeforeNext: Math.max(0, (row.blocked?.getTime() ?? row.expires.getTime()) - now),
    };
  };
  return {
    get: read,
    delete: async (key) => {
      const id = prefix + key;
      await getPrisma().$executeRaw`DELETE FROM "RateLimitRecord" WHERE "key" = ${id}`;
    },
    block: async (key, seconds) => {
      const id = prefix + key;
      const until = new Date(clock.nowMs() + seconds * 1000);
      await getPrisma().$executeRaw`
        INSERT INTO "RateLimitRecord" ("key", "consumed", "expiresAt", "blockedUntil", "updatedAt")
        VALUES (${id}, ${points}, ${until}, ${until}, NOW())
        ON CONFLICT ("key") DO UPDATE SET
          "consumed" = ${points}, "expiresAt" = ${until}, "blockedUntil" = ${until}, "updatedAt" = NOW()`;
    },
    consume: async (key) => {
      const id = prefix + key;
      const expires = new Date(clock.nowMs() + durationMs);
      const rows = await getPrisma().$queryRaw<LimitRow[]>`
        INSERT INTO "RateLimitRecord" ("key", "consumed", "expiresAt", "updatedAt")
        VALUES (${id}, 1, ${expires}, NOW())
        ON CONFLICT ("key") DO UPDATE SET
          "consumed" = CASE
            WHEN "RateLimitRecord"."expiresAt" <= NOW()
              AND ("RateLimitRecord"."blockedUntil" IS NULL OR "RateLimitRecord"."blockedUntil" <= NOW())
            THEN 1 ELSE "RateLimitRecord"."consumed" + 1 END,
          "expiresAt" = CASE
            WHEN "RateLimitRecord"."expiresAt" <= NOW()
              AND ("RateLimitRecord"."blockedUntil" IS NULL OR "RateLimitRecord"."blockedUntil" <= NOW())
            THEN ${expires} ELSE "RateLimitRecord"."expiresAt" END,
          "blockedUntil" = CASE
            WHEN "RateLimitRecord"."blockedUntil" <= NOW() THEN NULL
            ELSE "RateLimitRecord"."blockedUntil" END,
          "updatedAt" = NOW()
        RETURNING "consumed", "expiresAt" AS "expires", "blockedUntil" AS "blocked"`;
      const row = rows[0];
      if (!row) throw new Error('Rate-limit upsert returned no record');
      const now = clock.nowMs();
      const waitMs = Math.max(0, (row.blocked?.getTime() ?? row.expires.getTime()) - now);
      if ((row.blocked && row.blocked.getTime() > now) || row.consumed > points) {
        // rate-limiter-flexible's own refusal object: callers test `instanceof RateLimiterRes`.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw new RateLimiterRes(waitMs, row.consumed);
      }
      if (row.consumed === points && blockMs > 0) {
        await getPrisma().$executeRaw`
          UPDATE "RateLimitRecord" SET
            "blockedUntil" = NOW() + (${blockMs} * INTERVAL '1 millisecond'),
            "expiresAt" = GREATEST("expiresAt", NOW() + (${blockMs} * INTERVAL '1 millisecond'))
          WHERE "key" = ${id}`;
      }
      return {
        consumedPoints: row.consumed,
        remainingPoints: Math.max(0, points - row.consumed),
        msBeforeNext: waitMs,
      };
    },
  };
}
export function lazyLimiter(policy: LimitPolicy, options: { scaled?: boolean } = {}) {
  let limiter: PgLimiter | RateLimiterMemory | undefined;
  let scale = testScale;
  return {
    policy,
    get() {
      if (!limiter || scale !== testScale) {
        const points = policy.points * (options.scaled ? testScale : 1);
        limiter =
          process.env.NODE_ENV === 'production'
            ? postgresLimiter(policy, points)
            : new RateLimiterMemory({
                keyPrefix: `njangi:rl:${policy.name}`,
                points,
                duration: policy.durationSeconds,
                blockDuration: policy.blockSeconds ?? 0,
              });
        scale = testScale;
      }
      return limiter;
    },
    resetAllForTests() {
      limiter = undefined;
    },
  };
}
export type LazyLimiter = ReturnType<typeof lazyLimiter>;
export function retryAfterSeconds(res: { msBeforeNext: number }): number {
  return Math.max(1, Math.ceil(res.msBeforeNext / 1000));
}
export async function consumeOrThrow(
  limiter: LazyLimiter,
  key: string,
  res?: Response,
): Promise<void> {
  try {
    await limiter.get().consume(key);
  } catch (error) {
    if (error instanceof RateLimiterRes) {
      const seconds = retryAfterSeconds(error);
      res?.setHeader('Retry-After', String(seconds));
      throw commonError('RATE_LIMITED', {
        params: { seconds },
        details: { retryAfterSeconds: seconds },
      });
    }
    if (error instanceof AppError) throw error;
    throw commonError('SERVICE_UNAVAILABLE');
  }
}
export function rateLimit(
  limiter: LazyLimiter,
  keyOf: (req: Request) => string = (req) => req.ip ?? 'unknown',
): RequestHandler {
  return async (req, res, next) => {
    await consumeOrThrow(limiter, keyOf(req), res);
    next();
  };
}
export const floodLimits = {
  global: lazyLimiter({ name: 'global-ip', points: 600, durationSeconds: 60 }, { scaled: true }),
  auth: lazyLimiter({ name: 'auth-ip', points: 30, durationSeconds: 300 }, { scaled: true }),
  refresh: lazyLimiter({ name: 'refresh-ip', points: 120, durationSeconds: 300 }, { scaled: true }),
};
