import { defineConfig } from 'vitest/config';
import { loadTestEnv } from './test/env';

// API tests run against njangitrust_test (never the development database), one file at a time:
// the ledger is append-only, so tests isolate themselves with fresh groups and phone numbers
// instead of deleting rows.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    env: loadTestEnv(),
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
