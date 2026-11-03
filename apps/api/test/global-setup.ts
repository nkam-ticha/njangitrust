// Runs once before the API tests: recreates njangitrust_test from the migrations. Set
// SKIP_DB_RESET=1 to reuse the database between quick local runs.
import { resetTestDatabase } from '../scripts/reset-test-db';

export default function setup(): void {
  if (process.env.SKIP_DB_RESET === '1') return;
  resetTestDatabase();
}
