// The cron runner (serverless): jobs are PostgreSQL records taken in batches. Slow jobs (the
// agent's, which make model calls) have their own batch, so they cannot keep the quick jobs
// waiting; a job that is not started in time is released without losing an attempt.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '../lib/prisma';
import { processDueJobs, scheduleAt, SLOW_JOB_PREFIX } from './queues';
import { getJobDefinition, registerJob } from './registry';

const ran: string[] = [];
const QUICK = 'cronTest.quick';
const SLOW = 'cronTest.slowOne';

async function statusOf(jobKey: string) {
  const rows = await getPrisma().$queryRaw<{ status: string; attempts: number }[]>`
    SELECT "status", "attempts" FROM "DeploymentJob" WHERE "jobKey" = ${jobKey}`;
  return rows[0];
}

beforeAll(() => {
  for (const name of [QUICK, SLOW]) {
    if (!getJobDefinition(name)) {
      registerJob<{ key: string }>({
        name,
        process: (job) => {
          ran.push(job.data.key);
          return Promise.resolve();
        },
      });
    }
  }
});

describe('job batches of a cron run', () => {
  it('takes only the jobs of a prefix, and leaves the excluded ones for their own batch', async () => {
    const quick = `quick-${randomUUID()}`;
    const slow = `slow-${randomUUID()}`;
    const past = new Date(Date.now() - 1_000);
    await scheduleAt(QUICK, { key: quick }, past, quick);
    await scheduleAt(SLOW, { key: slow }, past, slow);

    const first = await processDueJobs(50, {
      onlyPrefix: 'cronTest.',
      exceptPrefix: 'cronTest.slow',
    });
    expect(first).toMatchObject({ failed: 0, released: 0 });
    expect(ran).toContain(quick);
    expect(ran).not.toContain(slow);
    expect(await statusOf(slow)).toMatchObject({ status: 'PENDING', attempts: 0 });

    await processDueJobs(50, { onlyPrefix: 'cronTest.slow' });
    expect(ran).toContain(slow);
    expect(await statusOf(slow)).toMatchObject({ status: 'SUCCEEDED' });
  });

  it('releases a job it has no time to start, without using an attempt', async () => {
    const key = `late-${randomUUID()}`;
    await scheduleAt(QUICK, { key }, new Date(Date.now() - 1_000), key);
    const result = await processDueJobs(50, { onlyPrefix: 'cronTest.', deadlineMs: 0 });
    expect(result.released).toBeGreaterThan(0);
    expect(result.succeeded).toBe(0);
    expect(ran).not.toContain(key);
    expect(await statusOf(key)).toMatchObject({ status: 'PENDING', attempts: 0 });
    await processDueJobs(50, { onlyPrefix: 'cronTest.' });
    expect(ran).toContain(key);
  });

  it('treats the agent jobs as the slow ones', () => {
    expect(SLOW_JOB_PREFIX).toBe('agent.');
  });
});
