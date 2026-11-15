// Shared PostgreSQL rate limits. Memory is retained only for tests/development.
import type { Request, RequestHandler, Response } from 'express';
import type { Redis } from 'ioredis';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { AppError, commonError } from '../lib/errors';
import { getPrisma } from '../lib/prisma';

export interface LimitPolicy { name: string; points: number; durationSeconds: number; blockSeconds?: number }
type Result = { remainingPoints: number; consumedPoints: number; msBeforeNext: number };
type PgLimiter = { consume(key: string): Promise<Result>; get(key: string): Promise<Result | null>; delete(key: string): Promise<void>; block(key: string, seconds: number): Promise<void> };
let testScale = 1;
/** Legacy startup hook retained for server.ts compatibility; PostgreSQL is authoritative. */
export function useRedisForRateLimits(_client: Redis): void { /* intentionally unused */ }
export function setRateLimitScaleForTests(scale: number): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('test only');
  testScale = scale;
}

function postgresLimiter(policy: LimitPolicy, points: number): PgLimiter {
  const prefix = `njangi:rl:${policy.name}:`;
  const durationMs = policy.durationSeconds * 1000;
  const blockMs = (policy.blockSeconds ?? 0) * 1000;
  const read = async (key: string): Promise<Result | null> => {
    const rows = await getPrisma().$queryRawUnsafe<Array<{ consumed: number; expires: Date; blocked: Date | null }>>(
      'SELECT "consumed", "expiresAt" AS "expires", "blockedUntil" AS "blocked" FROM "RateLimitRecord" WHERE "key" = $1', prefix + key,
    );
    const row = rows[0]; if (!row) return null;
    const now = Date.now();
    if (row.expires.getTime() <= now && (!row.blocked || row.blocked.getTime() <= now)) return null;
    return { consumedPoints: row.consumed, remainingPoints: Math.max(0, points - row.consumed), msBeforeNext: Math.max(0, (row.blocked?.getTime() ?? row.expires.getTime()) - now) };
  };
  return {
    get: read,
    delete: async (key) => { await getPrisma().$executeRawUnsafe('DELETE FROM "RateLimitRecord" WHERE "key" = $1', prefix + key); },
    block: async (key, seconds) => {
      const now = new Date(); const until = new Date(now.getTime() + seconds * 1000);
      await getPrisma().$executeRawUnsafe(`INSERT INTO "RateLimitRecord" ("key", "consumed", "expiresAt", "blockedUntil", "updatedAt") VALUES ($1, $2, $3, $3, NOW()) ON CONFLICT ("key") DO UPDATE SET "consumed" = $2, "expiresAt" = $3, "blockedUntil" = $3, "updatedAt" = NOW()`, prefix + key, points, until);
    },
    consume: async (key) => {
      const now = new Date(); const expires = new Date(now.getTime() + durationMs);
      const rows = await getPrisma().$queryRawUnsafe<Array<{ consumed: number; expires: Date; blocked: Date | null }>>(
        `INSERT INTO "RateLimitRecord" ("key", "consumed", "expiresAt", "updatedAt") VALUES ($1, 1, $2, NOW()) ON CONFLICT ("key") DO UPDATE SET "consumed" = CASE WHEN "RateLimitRecord"."expiresAt" <= NOW() AND ("RateLimitRecord"."blockedUntil" IS NULL OR "RateLimitRecord"."blockedUntil" <= NOW()) THEN 1 ELSE "RateLimitRecord"."consumed" + 1 END, "expiresAt" = CASE WHEN "RateLimitRecord"."expiresAt" <= NOW() AND ("RateLimitRecord"."blockedUntil" IS NULL OR "RateLimitRecord"."blockedUntil" <= NOW()) THEN $2 ELSE "RateLimitRecord"."expiresAt" END, "blockedUntil" = CASE WHEN "RateLimitRecord"."blockedUntil" <= NOW() THEN NULL ELSE "RateLimitRecord"."blockedUntil" END, "updatedAt" = NOW() RETURNING "consumed", "expiresAt" AS "expires", "blockedUntil" AS "blocked"`, prefix + key, expires,
      );
      const row = rows[0];
      if (!row) throw new Error('Rate-limit upsert returned no record');
      const waitMs = Math.max(0, (row.blocked?.getTime() ?? row.expires.getTime()) - Date.now());
      if ((row.blocked && row.blocked.getTime() > Date.now()) || row.consumed > points) throw new RateLimiterRes(waitMs, row.consumed);
      if (row.consumed === points && blockMs > 0) await getPrisma().$executeRawUnsafe('UPDATE "RateLimitRecord" SET "blockedUntil" = NOW() + ($2 * INTERVAL \'1 millisecond\'), "expiresAt" = GREATEST("expiresAt", NOW() + ($2 * INTERVAL \'1 millisecond\')) WHERE "key" = $1', prefix + key, blockMs);
      return { consumedPoints: row.consumed, remainingPoints: Math.max(0, points - row.consumed), msBeforeNext: waitMs };
    },
  };
}
export function lazyLimiter(policy: LimitPolicy, options: { scaled?: boolean } = {}) {
  let limiter: PgLimiter | RateLimiterMemory | undefined; let scale = testScale;
  return { policy, get() {
    if (!limiter || scale !== testScale) {
      const points = policy.points * (options.scaled ? testScale : 1);
      limiter = process.env.NODE_ENV === 'production' ? postgresLimiter(policy, points) : new RateLimiterMemory({ keyPrefix: `njangi:rl:${policy.name}`, points, duration: policy.durationSeconds, blockDuration: policy.blockSeconds ?? 0 });
      scale = testScale;
    }
    return limiter;
  }, resetAllForTests() { limiter = undefined; } };
}
export type LazyLimiter = ReturnType<typeof lazyLimiter>;
export function retryAfterSeconds(res: { msBeforeNext: number }): number { return Math.max(1, Math.ceil(res.msBeforeNext / 1000)); }
export async function consumeOrThrow(limiter: LazyLimiter, key: string, res?: Response): Promise<void> {
  try { await limiter.get().consume(key); } catch (error) {
    if (error instanceof RateLimiterRes) { const seconds = retryAfterSeconds(error); res?.setHeader('Retry-After', String(seconds)); throw commonError('RATE_LIMITED', { params: { seconds }, details: { retryAfterSeconds: seconds } }); }
    if (error instanceof AppError) throw error;
    throw commonError('SERVICE_UNAVAILABLE');
  }
}
export function rateLimit(limiter: LazyLimiter, keyOf: (req: Request) => string = (req) => req.ip ?? 'unknown'): RequestHandler {
  return async (req, res, next) => { await consumeOrThrow(limiter, keyOf(req), res); next(); };
}
export const floodLimits = {
  global: lazyLimiter({ name: 'global-ip', points: 600, durationSeconds: 60 }, { scaled: true }),
  auth: lazyLimiter({ name: 'auth-ip', points: 30, durationSeconds: 300 }, { scaled: true }),
  refresh: lazyLimiter({ name: 'refresh-ip', points: 120, durationSeconds: 300 }, { scaled: true }),
};
