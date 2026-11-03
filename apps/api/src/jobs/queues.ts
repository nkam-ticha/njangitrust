// BullMQ queues and workers (spec 2.2, 2.9), one queue per job name, on the `jobs` Redis
// connection. Delayed one-off jobs (a hold ending, a payout time) go through `scheduleAt`.
import { Queue, Worker } from 'bullmq';
import { clock } from '../lib/clock';
import { componentLogger } from '../lib/logger';
import { getRedis } from '../lib/redis';
import { getJobDefinition, JOB_TIMEZONE, jobDefinitions, repeatableJobs } from './registry';

const log = componentLogger('jobs');
const PREFIX = 'njangi';

const queues = new Map<string, Queue>();
const workers: Worker[] = [];

export function getQueue(name: string): Queue {
  if (!getJobDefinition(name)) throw new Error(`Unknown job ${name}`);
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection: getRedis('jobs'), prefix: PREFIX });
    queues.set(name, queue);
  }
  return queue;
}

/** Enqueues a job to run at `at` (UTC instant). `jobId` makes it idempotent. */
export async function scheduleAt(
  name: string,
  data: Record<string, unknown>,
  at: Date,
  jobId: string,
): Promise<void> {
  const definition = getJobDefinition(name);
  await getQueue(name).add(name, data, {
    jobId,
    delay: Math.max(0, at.getTime() - clock.nowMs()),
    attempts: definition?.attempts ?? 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  });
}

/** Starts a worker per registered job and installs the repeatable schedules. */
export async function startJobs(): Promise<void> {
  for (const definition of jobDefinitions()) {
    const worker = new Worker(definition.name, definition.process, {
      connection: getRedis('jobs'),
      prefix: PREFIX,
      concurrency: definition.concurrency ?? 1,
    });
    worker.on('failed', (job, error) => log.error({ job: definition.name, jobId: job?.id, err: error }, 'job failed'));
    workers.push(worker);
  }
  for (const repeatable of repeatableJobs()) {
    await getQueue(repeatable.name).upsertJobScheduler(
      repeatable.id,
      { pattern: repeatable.pattern, tz: JOB_TIMEZONE },
      { name: repeatable.name, data: repeatable.data ?? {}, opts: { removeOnComplete: 100, removeOnFail: 1_000 } },
    );
  }
  log.info({ workers: workers.length, schedules: repeatableJobs().length }, 'jobs started');
}

export async function stopJobs(): Promise<void> {
  await Promise.allSettled(workers.splice(0).map((w) => w.close()));
  await Promise.allSettled([...queues.values()].map((q) => q.close()));
  queues.clear();
}
