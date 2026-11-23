// The scheduler alarm: a job that has waited too long makes /health "down" in production.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getPrisma } from '../lib/prisma';
import { jobsHealth, oldestOverdueJobSeconds } from './health';

async function queueJob(minutesAgo: number, status = 'PENDING'): Promise<string> {
  const id = randomUUID();
  await getPrisma().$executeRaw`
    INSERT INTO "DeploymentJob" ("id", "name", "jobKey", "payload", "runAt", "status", "createdAt", "updatedAt")
    VALUES (${id}::uuid, 'test.health', ${id}, '{}'::jsonb,
            NOW() - (${minutesAgo} * INTERVAL '1 minute'), ${status}, NOW(), NOW())`;
  return id;
}

describe('the scheduler alarm', () => {
  it('expects no scheduler outside production', async () => {
    const id = await queueJob(60);
    try {
      expect(await jobsHealth(false)).toBe('not_configured');
    } finally {
      await getPrisma()
        .$executeRaw`UPDATE "DeploymentJob" SET "status" = 'SUCCEEDED' WHERE "id" = ${id}::uuid`;
    }
  });

  it('sees a job that has waited for more than ten minutes', async () => {
    const id = await queueJob(20);
    try {
      expect(await oldestOverdueJobSeconds()).toBeGreaterThanOrEqual(20 * 60);
      expect(await jobsHealth(true)).toBe('down');
    } finally {
      await getPrisma()
        .$executeRaw`UPDATE "DeploymentJob" SET "status" = 'SUCCEEDED' WHERE "id" = ${id}::uuid`;
    }
  });

  it('ignores jobs that finished and jobs that are only a little late', async () => {
    const done = await queueJob(60, 'SUCCEEDED');
    const recent = await queueJob(2);
    try {
      // Only these two rows are checked: other tests may leave old jobs waiting in the database.
      const rows = await getPrisma().$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM "DeploymentJob"
        WHERE "id" IN (${done}::uuid, ${recent}::uuid)
          AND "status" IN ('PENDING', 'RETRY')
          AND "runAt" < NOW() - (10 * INTERVAL '1 minute')`;
      expect(rows[0]?.n).toBe(0);
    } finally {
      await getPrisma()
        .$executeRaw`UPDATE "DeploymentJob" SET "status" = 'SUCCEEDED' WHERE "id" = ${recent}::uuid`;
    }
  });
});
