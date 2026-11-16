// One Express app per test file, with flood limits relaxed (PIN lockouts stay real).
import type { Express } from 'express';
import { createApp } from '../../src/app';
import { useJobScheduler } from '../../src/jobs/dispatch';
import { setRateLimitScaleForTests } from '../../src/http/rate-limit';

let app: Express | undefined;

export function testApp(): Express {
  if (!app) {
    setRateLimitScaleForTests(1_000);
    app = createApp();
    // createApp() sends jobs to the PostgreSQL queue, which only the cron run processes. Tests
    // have no cron: jobs due now run in-process and are awaited with `settleBackground()`.
    useJobScheduler(null);
  }
  return app;
}
