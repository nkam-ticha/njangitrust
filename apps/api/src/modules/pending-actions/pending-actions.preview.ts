// Comparing the card a member confirmed with the card the situation gives now (spec 4.5, rule 5).
// The confirmation compares them before it executes; an action that sends money compares them again
// under its locks, because a commit may land between the first check and the lock.
import { canonicalJSON } from '@njangi/rules';
import { actionPreviewSchema } from '@njangi/shared/contracts/pending-actions';
import { actionError } from './pending-actions.errors';

/** True when both cards are the same to the letter (canonical JSON, after schema parsing). */
export function samePreview(a: unknown, b: unknown): boolean {
  return (
    canonicalJSON(actionPreviewSchema.parse(a)) === canonicalJSON(actionPreviewSchema.parse(b))
  );
}

/**
 * Throws ACTION_CHANGED, so nothing is sent, unless `current` is exactly the card the member
 * confirmed (`ctx.preview`). Call it in `execute`, after taking the locks and re-preparing.
 */
export function assertSamePreview(confirmed: unknown, current: unknown): void {
  if (!samePreview(confirmed, current)) throw actionError('ACTION_CHANGED');
}
