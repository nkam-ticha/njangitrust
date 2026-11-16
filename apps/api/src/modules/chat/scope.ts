// Where a service function runs. A confirmed PendingAction runs it inside the confirm transaction
// (`scope` given: its `db` and the after-commit queue); a REST route or a job lets it open its own.
// Side effects (realtime, pushes, jobs) always go on `effects` and run only after the commit.
import { AfterCommit, type EffectSink } from '../../lib/after-commit';
import { withTransaction, type Prisma } from '../../lib/prisma';

export interface Scope {
  db: Prisma.TransactionClient;
  effects: EffectSink;
}

/** Runs `fn` in the caller's scope, or in a new transaction whose effects run once it commits. */
export async function runScoped<T>(
  scope: Scope | undefined,
  fn: (scope: Scope) => Promise<T>,
): Promise<T> {
  if (scope) return fn(scope);
  const effects = new AfterCommit();
  const result = await withTransaction((tx) => fn({ db: tx, effects }));
  await effects.run();
  return result;
}
