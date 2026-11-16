// Periodic scan for round opening (spec 2.9). The scan makes scheduled work survive restarts and
// does not rely on an in-process timer or an after-commit side effect.
import type { Job } from 'bullmq';
import { registerJob, registerRepeatable } from '../../jobs/registry';
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
}
