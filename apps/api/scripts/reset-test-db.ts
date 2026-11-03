// Recreates njangitrust_test from the migrations, as the schema owner (D2). Used by
// `pnpm db:reset:test` and by the Vitest global setup. Refuses any database not named *_test.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assertTestDatabase } from '../test/env';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function resetTestDatabase(): void {
  const envFile = path.join(apiDir, '.env');
  if (existsSync(envFile) && !process.env.TEST_MIGRATION_DATABASE_URL) process.loadEnvFile(envFile);
  const ownerUrl = assertTestDatabase(process.env.TEST_MIGRATION_DATABASE_URL, 'TEST_MIGRATION_DATABASE_URL');
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  // `migrate reset` drops the schema and replays every migration, including the grants and
  // ledger protections; --force skips the confirmation prompt.
  execFileSync(process.execPath, [prismaCli, 'migrate', 'reset', '--force'], {
    cwd: apiDir,
    env: { ...process.env, PRISMA_MIGRATE_URL: ownerUrl, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  resetTestDatabase();
  process.stdout.write('njangitrust_test recreated from the migrations.\n');
}
