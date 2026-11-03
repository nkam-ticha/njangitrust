// Job `pendingActions.expire` (spec 2.9): every minute, expire actions older than 10 minutes.
import { registerJob, registerRepeatable } from '../../jobs/registry';
import { expireDuePendingActions } from './pending-actions.service';

export function registerPendingActionJobs(): void {
  registerJob({
    name: 'pendingActions.expire',
    process: async () => ({ expired: await expireDuePendingActions() }),
  });
  registerRepeatable({ id: 'pendingActions.expire.everyMinute', name: 'pendingActions.expire', pattern: '* * * * *' });
}
