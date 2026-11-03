// The job registry (spec 2.9). Each module plugs its processors and schedules in here; the
// server starts the workers. Schedules use the Africa/Douala time zone (CLAUDE.md rule 9).
import type { Job } from 'bullmq';

export const JOB_TIMEZONE = 'Africa/Douala';

export type JobProcessor<D = unknown> = (job: Job<D>) => Promise<unknown>;

export interface JobDefinition<D = unknown> {
  /** Queue and job name, as in spec 2.9: `pendingActions.expire`, `round.open`, ... */
  name: string;
  process: JobProcessor<D>;
  /** Jobs run at the same time per worker. Money jobs should keep 1. */
  concurrency?: number;
  /** Retries with exponential backoff. Provider jobs re-check status before every retry (rule 8). */
  attempts?: number;
}

export interface RepeatableJob {
  /** Stable scheduler id, so restarts update the schedule instead of adding one. */
  id: string;
  name: string;
  /** Cron pattern, read in Africa/Douala time. */
  pattern: string;
  data?: Record<string, unknown>;
}

const definitions = new Map<string, JobDefinition>();
const repeatables = new Map<string, RepeatableJob>();

const NAME = /^[a-z][A-Za-z]*(\.[a-z][A-Za-z]*)+$/;

export function registerJob<D>(definition: JobDefinition<D>): void {
  if (!NAME.test(definition.name)) throw new Error(`Invalid job name ${definition.name}`);
  if (definitions.has(definition.name)) throw new Error(`Job ${definition.name} is already registered`);
  definitions.set(definition.name, definition as JobDefinition);
}

export function registerRepeatable(job: RepeatableJob): void {
  if (!definitions.has(job.name)) throw new Error(`Register the processor of ${job.name} first`);
  repeatables.set(job.id, job);
}

export function jobDefinitions(): JobDefinition[] {
  return [...definitions.values()];
}

export function repeatableJobs(): RepeatableJob[] {
  return [...repeatables.values()];
}

export function getJobDefinition(name: string): JobDefinition | undefined {
  return definitions.get(name);
}
