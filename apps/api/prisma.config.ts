// Prisma CLI configuration (multi-file schema, migrations). Migrations always run as the schema
// owner (njangi_owner, D2); the API itself connects as njangi_app through DATABASE_URL.
import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env; load it here (Node >= 20.12, no dependency).
const envFile = new URL('./.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

// PRISMA_MIGRATE_URL lets scripts/reset-test-db.ts target the test database explicitly.
const url = process.env.PRISMA_MIGRATE_URL ?? process.env.MIGRATION_DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations' },
  ...(url ? { datasource: { url } } : {}),
});
