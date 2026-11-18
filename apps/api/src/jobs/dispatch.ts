// Sending work to a job (spec 2.9). In the server, jobs go to BullMQ (`scheduleAt`); without
// workers (tests, scripts) a job due now runs in-process in the background, always as the system,
// never inside the request that asked for it (privacy-guard H1). Tests await `settleBackground()`.
import { clock } from '../lib/clock';
import { componentLogger } from '../lib/logger';
import { runAsSystem } from '../lib/request-context';
import { getJobDefinition } from './registry';

const log = componentLogger('jobs');

type Scheduler = (
  name: string,
  data: Record<string, unknown>,
  at: Date,
  jobId: string,
) => Promise<void>;

let scheduler: Scheduler | null = null;
const running = new Set<Promise<unknown>>();

/** Server start-up: jobs go to the queues from now on (tests may record, then pass null). */
export function useJobScheduler(next: Scheduler | null): void {
  scheduler = next;
}

export function currentJobScheduler(): Scheduler | null {
  return scheduler;
}

/** Runs `fn` after the current request, detached from its context. */
export function runInBackground(name: string, fn: () => Promise<unknown>): void {
  const task = new Promise<void>((resolve) => setImmediate(resolve))
    .then(() => runAsSystem(fn))
    .catch((error: unknown) => log.error({ err: error, job: name }, 'background job failed'))
    .finally(() => running.delete(task));
  running.add(task);
}

/**
 * Asks for job `name` with `data` at `at` (default now). `jobId` makes it idempotent in BullMQ.
 * Without a scheduler, a job due now runs in the background and a later one is left to the
 * repeatable scan that catches overdue work.
 */
export async function dispatchJob(
  name: string,
  data: Record<string, unknown>,
  options: { jobId: string; at?: Date },
): Promise<void> {
  const definition = getJobDefinition(name);
  if (!definition) throw new Error(`Unknown job ${name}`);
  const at = options.at ?? clock.now();
  if (scheduler) {
    await scheduler(name, data, at, options.jobId);
    return;
  }
  if (at.getTime() <= clock.nowMs()) {
    runInBackground(name, () => definition.process({ data, name, id: options.jobId } as never));
  }
}

/** Tests: waits until every background job (and the jobs they started) has finished. */
export async function settleBackground(): Promise<void> {
  while (running.size > 0) await Promise.all([...running]);
}
