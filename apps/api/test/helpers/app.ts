// One Express app per test file, with flood limits relaxed (PIN lockouts stay real).
import type { Express } from 'express';
import { createApp } from '../../src/app';
import { setRateLimitScaleForTests } from '../../src/http/rate-limit';

let app: Express | undefined;

export function testApp(): Express {
  if (!app) {
    setRateLimitScaleForTests(1_000);
    app = createApp();
  }
  return app;
}
