// The environment API tests run with: apps/api/.env, but pointed at njangitrust_test, with logs
// silenced, files in a temporary folder and rate-limit counters in memory.
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const TEST_ORIGIN = 'http://localhost:8081';

function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}

/** Refuses anything but a database whose name ends in `_test`: tests reset it. */
export function assertTestDatabase(url: string | undefined, variable: string): string {
  if (!url) throw new Error(`${variable} is missing from apps/api/.env`);
  if (!databaseName(url).endsWith('_test')) {
    throw new Error(`${variable} must point to a database whose name ends with _test`);
  }
  return url;
}

export function loadTestEnv(): Record<string, string> {
  const file = new URL('../.env', import.meta.url);
  if (existsSync(file)) process.loadEnvFile(file);
  const app = assertTestDatabase(process.env.TEST_DATABASE_URL, 'TEST_DATABASE_URL');
  const owner = assertTestDatabase(process.env.TEST_MIGRATION_DATABASE_URL, 'TEST_MIGRATION_DATABASE_URL');
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
    DATABASE_URL: app,
    MIGRATION_DATABASE_URL: owner,
    TEST_MIGRATION_DATABASE_URL: owner,
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_DIR: path.join(tmpdir(), 'njangitrust-test-storage'),
    PAYMENT_PROVIDER: 'mock',
    PUBLIC_BASE_URL: 'http://localhost:3000',
    WEB_ORIGINS: TEST_ORIGIN,
  };
}
