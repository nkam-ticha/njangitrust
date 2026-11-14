// The test database (njangitrust_test) and its migrations, always as the schema owner (D2).
// Refuses any database whose name doesn't end in _test.
//
// - `migrateTestDatabase()` applies pending migrations (`prisma migrate deploy`, non-destructive).
//   The Vitest global setup uses it: tests never delete rows (the ledger is append-only), they
//   isolate themselves with fresh groups and phone numbers.
// - `pnpm db:reset:test` (this file run directly) drops and recreates the test database from the
//   migrations (`prisma migrate reset`). Destructive: a person runs it, e.g. after editing a
//   migration that has not been committed yet.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assertTestDatabase } from '../test/env';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function ownerUrl(): string {
  const envFile = path.join(apiDir, '.env');
  if (existsSync(envFile) && !process.env.TEST_MIGRATION_DATABASE_URL) process.loadEnvFile(envFile);
  return assertTestDatabase(process.env.TEST_MIGRATION_DATABASE_URL, 'TEST_MIGRATION_DATABASE_URL');
}

function prisma(args: string[], stdio: 'pipe' | 'inherit'): void {
  const cli = path.join(
    path.dirname(createRequire(import.meta.url).resolve('prisma/package.json')),
    'build',
    'index.js',
  );
  try {
    execFileSync(process.execPath, [cli, ...args], {
      cwd: apiDir,
      env: { ...process.env, PRISMA_MIGRATE_URL: ownerUrl(), PRISMA_HIDE_UPDATE_MESSAGE: '1' },
      stdio: stdio === 'inherit' ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const output =
      String((error as { stderr?: Buffer }).stderr ?? '') +
      String((error as { stdout?: Buffer }).stdout ?? '');
    // Never print a connection string (it holds the password).
    const safe = output.replace(/postgres(ql)?:\/\/\S+/g, '[database url]');
    throw new Error(`prisma ${args.join(' ')} failed on the test database:\n${safe}`, {
      cause: error,
    });
  }
}

/** Applies pending migrations to njangitrust_test. */
export function migrateTestDatabase(): void {
  prisma(['migrate', 'deploy'], 'pipe');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Interactive on purpose: Prisma asks before destroying anything.
  prisma(['migrate', 'reset'], 'inherit');
}
