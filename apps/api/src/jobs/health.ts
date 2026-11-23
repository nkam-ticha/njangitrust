// The scheduler alarm for GET /health. On Vercel nothing runs timed work by itself: Supabase Cron
// calls /api/cron every minute (docs/SUPABASE_CRON_SETUP.sql). If that stops, votes stay open,
// late fines are never assessed and notifications never leave, and nobody sees an error. A job
// that has been due for longer than this makes /health report "down", so any uptime monitor
// pointed at /health warns the owner.
import { getPrisma } from '../lib/prisma';
import type { CheckStatus } from '../http/health';

/** A job still waiting this long after its time means the scheduler is not running. */
export const JOB_STALL_MS = 10 * 60_000;

/** Seconds a due job has been waiting; null when nothing is overdue. */
export async function oldestOverdueJobSeconds(
  stallMs: number = JOB_STALL_MS,
): Promise<number | null> {
  const rows = await getPrisma().$queryRaw<{ age: number | null }[]>`
    SELECT EXTRACT(EPOCH FROM (NOW() - MIN("runAt")))::int AS age
    FROM "DeploymentJob"
    WHERE "status" IN ('PENDING', 'RETRY')
      AND "runAt" < NOW() - (${stallMs} * INTERVAL '1 millisecond')`;
  return rows[0]?.age ?? null;
}

/**
 * "up" while due jobs are picked up; "down" when one has waited too long. Outside production there
 * is no scheduler to expect (tests and local work leave jobs waiting), so it is "not_configured".
 */
export async function jobsHealth(production: boolean): Promise<CheckStatus> {
  if (!production) return 'not_configured';
  return (await oldestOverdueJobSeconds()) === null ? 'up' : 'down';
}
