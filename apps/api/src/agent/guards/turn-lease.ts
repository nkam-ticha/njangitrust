// One turn at a time per member, so the lines of a conversation never interleave. The API runs as
// serverless functions: two requests of the same member can land on two instances, so the lock is a
// row in PostgreSQL (the shared counters table), not process memory. A lease expires by itself, so
// a function that is cut off never blocks the member for longer than LEASE_MS.
import { agentErrorTexts } from '@njangi/shared/i18n/server/agent';
import { defineErrors } from '../../lib/errors';
import { getPrisma } from '../../lib/prisma';

/** Longer than the longest request (60 s function limit). */
export const LEASE_MS = 75_000;
const POLL_MS = 250;

const leaseError = defineErrors({
  AGENT_BUSY: { status: 409, text: agentErrorTexts.AGENT_BUSY },
});

const keyOf = (userId: string) => `njangi:lease:agent-turn:${userId}`;

async function claim(userId: string): Promise<boolean> {
  const rows = await getPrisma().$queryRaw<{ key: string }[]>`
    INSERT INTO "RateLimitRecord" ("key", "consumed", "expiresAt", "updatedAt")
    VALUES (${keyOf(userId)}, 1, NOW() + (${LEASE_MS} * INTERVAL '1 millisecond'), NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "consumed" = 1, "expiresAt" = EXCLUDED."expiresAt", "updatedAt" = NOW()
      WHERE "RateLimitRecord"."expiresAt" <= NOW()
    RETURNING "key"`;
  return rows.length === 1;
}

export async function release(userId: string): Promise<void> {
  await getPrisma().$executeRaw`DELETE FROM "RateLimitRecord" WHERE "key" = ${keyOf(userId)}`;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn` while holding the member's turn lease. Waits up to `waitMs` for a turn in progress,
 * then refuses with AGENT_BUSY (the member's message is not lost: the app keeps it in the composer).
 */
export async function withTurnLease<T>(
  userId: string,
  fn: () => Promise<T>,
  options: { waitMs?: number } = {},
): Promise<T> {
  const attempts = Math.max(1, Math.ceil((options.waitMs ?? 8_000) / POLL_MS));
  let held = false;
  for (let attempt = 0; attempt < attempts && !held; attempt += 1) {
    held = await claim(userId);
    if (!held && attempt < attempts - 1) await sleep(POLL_MS);
  }
  if (!held) throw leaseError('AGENT_BUSY');
  try {
    return await fn();
  } finally {
    await release(userId).catch(() => undefined);
  }
}
