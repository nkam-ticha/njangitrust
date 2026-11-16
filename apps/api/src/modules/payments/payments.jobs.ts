import type { Job } from 'bullmq';
import { registerJob } from '../../jobs/registry';
import { pollPaymentIntent, submitPaymentIntent } from './payments.service';

type PaymentJob = Job<{ paymentIntentId: string }>;

export function registerPaymentJobs(): void {
  registerJob({
    name: 'payments.submit',
    concurrency: 1,
    attempts: 8,
    keepNoHistory: true,
    process: async (job: PaymentJob) => submitPaymentIntent(job.data.paymentIntentId),
  });
  registerJob({
    name: 'payments.poll',
    concurrency: 1,
    attempts: 8,
    keepNoHistory: true,
    process: async (job: PaymentJob) => pollPaymentIntent(job.data.paymentIntentId),
  });
}
