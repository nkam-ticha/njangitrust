// Periodically open payouts whose time has arrived (spec 2.9). Every transition is idempotent.
import type { Job } from 'bullmq';
import { registerJob, registerRepeatable } from '../../jobs/registry';
import { openDuePayouts } from './payouts.service';

export function registerPayoutJobs(): void {
  registerJob({
    name: 'payout.open',
    keepNoHistory: true,
    process: async (_job: Job) => {
      await openDuePayouts();
    },
  });
  registerRepeatable({ id: 'payout.open.scan', name: 'payout.open', pattern: '*/5 * * * *' });
}
