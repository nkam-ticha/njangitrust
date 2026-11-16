import { registerJob, registerRepeatable } from '../../jobs/registry';
import { processFineJob } from './fines.service';

export function registerFineJobs(): void {
  registerJob({
    name: 'fines.assess',
    keepNoHistory: true,
    concurrency: 1,
    process: processFineJob,
  });
  registerRepeatable({ id: 'fines.assess.scan', name: 'fines.assess', pattern: '*/5 * * * *' });
}
