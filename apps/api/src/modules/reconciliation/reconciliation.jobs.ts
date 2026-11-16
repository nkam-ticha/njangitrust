import type { Job } from 'bullmq';
import { registerJob, registerRepeatable } from '../../jobs/registry';
import { runAllDailyReconciliations, runDailyReconciliation } from './reconciliation.service';

type ReconciliationJob = Job<{ providerAccount?: string }>;

export function registerReconciliationJobs(): void {
  registerJob({
    name: 'reconciliation.daily',
    concurrency: 1,
    attempts: 3,
    keepNoHistory: true,
    process: async (job: ReconciliationJob) => {
      if (job.data?.providerAccount) await runDailyReconciliation(job.data.providerAccount);
      else await runAllDailyReconciliations();
    },
  });
  registerRepeatable({
    id: 'reconciliation.daily.6am',
    name: 'reconciliation.daily',
    pattern: '0 6 * * *',
  });
}
