// Runs once before the API tests: applies pending migrations to njangitrust_test (never
// destructive). Set SKIP_DB_MIGRATE=1 to skip it on quick local runs.
import { migrateTestDatabase } from '../scripts/reset-test-db';

export default function setup(): void {
  if (process.env.SKIP_DB_MIGRATE === '1') return;
  migrateTestDatabase();
}
