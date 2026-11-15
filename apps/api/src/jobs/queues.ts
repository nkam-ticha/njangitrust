// Durable PostgreSQL job queue used by Vercel cron and the long-running server.
import { randomUUID } from 'node:crypto';
import { componentLogger } from '../lib/logger';
import { getPrisma } from '../lib/prisma';
import { getJobDefinition, repeatableJobs } from './registry';

const log = componentLogger('jobs');
const DEFAULT_BATCH_SIZE = 20;
const MAX_BATCH_SIZE = 100;
const LEASE_MS = 60_000;
const MAX_ATTEMPTS = 8;

type ClaimedJob = { id: string; name: string; payload: unknown; attempts: number; leaseToken: string };

/** Idempotently inserts or brings forward a pending job with the same name and stable id. */
export async function scheduleAt(name: string, data: Record<string, unknown>, at: Date, jobId: string): Promise<void> {
  if (!getJobDefinition(name)) throw new Error(`Unknown job ${name}`);
  if (!jobId || jobId.length > 200) throw new Error('Invalid job id');
  await getPrisma().$executeRaw`
    INSERT INTO "DeploymentJob" ("id", "name", "jobKey", "payload", "runAt", "status", "attempts", "maxAttempts", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${name}, ${jobId}, ${JSON.stringify(data)}::jsonb, ${at}, 'PENDING', 0, ${Math.min(getJobDefinition(name)?.attempts ?? 3, MAX_ATTEMPTS)}, NOW(), NOW())
    ON CONFLICT ("name", "jobKey") DO UPDATE SET
      "payload" = EXCLUDED."payload", "runAt" = LEAST("DeploymentJob"."runAt", EXCLUDED."runAt"), "updatedAt" = NOW()
    WHERE "DeploymentJob"."status" IN ('PENDING', 'RETRY')`;
}

/** Repeatables are represented as due database jobs. Cron schedules themselves are currently
 * registered by Vercel configuration/operations; module schedule definitions are not parsed here. */
export async function startJobs(): Promise<void> {
  for (const repeatable of repeatableJobs()) {
    log.warn({ name: repeatable.name, id: repeatable.id }, 'repeatable schedule requires cron integration');
  }
}

/** Enqueue recurring definitions matching this Douala-local minute, idempotently. */
export async function enqueueDueRepeatables(now = new Date()): Promise<number> {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const minute = Number(values.minute);
  const hour = Number(values.hour);
  const day = Number(values.day);
  const month = Number(values.month);
  const weekday = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[values.weekday ?? ''];
  const currentMinute = `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
  let enqueued = 0;
  for (const repeatable of repeatableJobs()) {
    const fields = repeatable.pattern.trim().split(/\s+/);
    if (fields.length !== 5) throw new Error(`Unsupported cron pattern for ${repeatable.id}`);
    const current = [minute, hour, day, month, weekday];
    const matches = fields.every((field, index) => {
      if (field === '*') return true;
      const step = /^\*\/(\d+)$/.exec(field);
      if (step) return current[index]! % Number(step[1]) === 0;
      return field.split(',').some((value) => Number(value) === current[index]!);
    });
    if (!matches) continue;
    await scheduleAt(repeatable.name, repeatable.data ?? {}, now, `repeat-${repeatable.id}-${currentMinute}`);
    enqueued++;
  }
  return enqueued;
}

export async function stopJobs(): Promise<void> { /* no persistent worker to stop */ }

async function claimBatch(limit: number): Promise<ClaimedJob[]> {
  const leaseToken = randomUUID();
  await getPrisma().$executeRaw`
    UPDATE "DeploymentJob" SET "status"='DEAD', "leaseUntil"=NULL, "leaseToken"=NULL, "updatedAt"=NOW()
    WHERE "status"='RUNNING' AND "leaseUntil" < NOW() AND "attempts" >= "maxAttempts"`;
  return getPrisma().$queryRaw<ClaimedJob[]>`
    WITH candidates AS (
      SELECT "id" FROM "DeploymentJob"
      WHERE (("status" IN ('PENDING', 'RETRY') AND "runAt" <= NOW())
        OR ("status" = 'RUNNING' AND "leaseUntil" < NOW() AND "attempts" < "maxAttempts"))
      ORDER BY "runAt", "createdAt"
      FOR UPDATE SKIP LOCKED LIMIT ${limit}
    )
    UPDATE "DeploymentJob" j SET "status" = 'RUNNING', "leaseUntil" = NOW() + (${LEASE_MS} * INTERVAL '1 millisecond'),
      "leaseToken" = ${leaseToken}, "attempts" = j."attempts" + 1, "updatedAt" = NOW()
    FROM candidates c WHERE j."id" = c."id"
    RETURNING j."id", j."name", j."payload", j."attempts", j."leaseToken"`;
}

async function finish(job: ClaimedJob): Promise<void> {
  await getPrisma().$executeRaw`UPDATE "DeploymentJob" SET "status"='SUCCEEDED', "leaseUntil"=NULL, "leaseToken"=NULL, "updatedAt"=NOW() WHERE "id"=${job.id} AND "leaseToken"=${job.leaseToken}`;
}

async function fail(job: ClaimedJob, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message.slice(0, 1000) : 'Job failed';
  const delay = Math.min(5_000 * 2 ** Math.max(0, job.attempts - 1), 300_000);
  await getPrisma().$executeRaw`
    UPDATE "DeploymentJob" SET "status"=CASE WHEN "attempts" >= "maxAttempts" THEN 'DEAD' ELSE 'RETRY' END,
      "runAt"=NOW() + (${delay} * INTERVAL '1 millisecond'), "leaseUntil"=NULL, "leaseToken"=NULL,
      "lastError"=${message}, "updatedAt"=NOW() WHERE "id"=${job.id} AND "leaseToken"=${job.leaseToken}`;
}

/** Processes a bounded batch sequentially; each handler's database effects must be idempotent. */
export async function processDueJobs(requestedLimit = DEFAULT_BATCH_SIZE): Promise<{ claimed: number; succeeded: number; failed: number }> {
  const limit = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(requestedLimit) || DEFAULT_BATCH_SIZE));
  const jobs = await claimBatch(limit);
  let succeeded = 0;
  let failed = 0;
  for (const job of jobs) {
    const definition = getJobDefinition(job.name);
    try {
      if (!definition) throw new Error(`No processor registered for ${job.name}`);
      const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
      await definition.process({ data: payload, name: job.name, id: job.id } as never);
      await finish(job);
      succeeded++;
    } catch (error) {
      await fail(job, error);
      log.error({ job: job.name, jobId: job.id, err: error }, 'job failed');
      failed++;
    }
  }
  return { claimed: jobs.length, succeeded, failed };
}

export const JOB_BATCH_LIMIT = MAX_BATCH_SIZE;

/** Retention metadata retained for existing privacy-focused job tests and documentation. */
export function jobOptions(name: string): { removeOnComplete: boolean } {
  return { removeOnComplete: getJobDefinition(name)?.keepNoHistory === true };
}
