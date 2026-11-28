// Periodic scans for cycles (spec 2.9): round opening, cycle closing (D40.1) and the weekly reminder
// to an admin whose group waits between cycles (D40.2). They make scheduled work survive restarts and
// do not rely on an in-process timer or an after-commit side effect. Every step is idempotent, so the
// serverless cron (database jobs, no Redis) can run them as often as it likes.
import type { Job } from 'bullmq';
import { registerJob, registerRepeatable } from '../../jobs/registry';
import { closeDueCycles } from './cycles.close';
import { remindAdminsBetweenCycles } from './cycles.reminders';
import { openDueRounds } from './cycles.service';

export function registerCycleJobs(): void {
  registerJob({
    name: 'round.open',
    keepNoHistory: true,
    process: async (_job: Job) => {
      await openDueRounds();
    },
  });
  registerRepeatable({ id: 'round.open.scan', name: 'round.open', pattern: '*/5 * * * *' });
  registerJob({
    name: 'cycle.close',
    keepNoHistory: true,
    // Money job: one at a time per worker.
    concurrency: 1,
    process: async (_job: Job) => {
      await closeDueCycles();
      await remindAdminsBetweenCycles();
    },
  });
  registerRepeatable({ id: 'cycle.close.scan', name: 'cycle.close', pattern: '*/5 * * * *' });
}
