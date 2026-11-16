// The chat, media, meetings, statements and audit export routes are mounted by src/http/router.ts and
// their handlers and jobs registered by src/modules/register.ts, so the app these tests use is the
// real one. The name is kept for the test files written before the wiring.
import type { Express } from 'express';
import { testApp } from './app';

export function stageApp(): Express {
  return testApp();
}
