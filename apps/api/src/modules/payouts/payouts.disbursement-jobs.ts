// Provider sends and status polling for withdrawals (spec 2.6, D18.1).
import type { Job } from 'bullmq';
import { registerJob } from '../../jobs/registry';
import { pollDisbursement, submitDisbursement } from './withdrawals.service';

type DisbursementJob = Job<{ disbursementId: string }>;

export function registerDisbursementJobs(): void {
  registerJob({
    name: 'disbursements.submit',
    attempts: 1,
    keepNoHistory: true,
    process: async (job: DisbursementJob) => {
      await submitDisbursement(job.data.disbursementId);
    },
  });
  registerJob({
    name: 'disbursements.poll',
    attempts: 1,
    keepNoHistory: true,
    process: async (job: DisbursementJob) => {
      await pollDisbursement(job.data.disbursementId);
    },
  });
}
