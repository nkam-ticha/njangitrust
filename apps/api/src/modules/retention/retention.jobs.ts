// The retention job (D33): every day at 03:30 and 09:30 (Douala) it deletes what was sent more than
// three months ago. Each run stops after about 35 seconds and the next one carries on, so a long
// backlog is worked off over several runs; running again is harmless.
import { registerJob, registerRepeatable } from '../../jobs/registry';
import { purgeExpiredContent } from './retention.service';

let registered = false;

export function registerRetentionJobs(): void {
  if (registered) return;
  registered = true;
  registerJob({
    name: 'retention.purge',
    // Nothing worth keeping about a run beyond its audit line (counts only).
    keepNoHistory: true,
    process: async () => {
      await purgeExpiredContent();
    },
  });
  registerRepeatable({
    id: 'retention.purge.daily',
    name: 'retention.purge',
    pattern: '30 3,9 * * *',
  });
}
