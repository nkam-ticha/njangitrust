// Cycle size (R1.1, R2.1).

import type { Refusal } from '../result';

/** R1.1: active members needed to start a cycle. */
export const MIN_MEMBERS_TO_START = 3;
/** R1.1: maximum group size. */
export const MAX_MEMBERS = 50;

/** R1.1: a cycle starts only with 3 to 50 active members. */
export function canStartCycle(
  activeMemberCount: number,
):
  | { ok: true }
  | Refusal<'NOT_ENOUGH_MEMBERS', { minimum: number; count: number }>
  | Refusal<'TOO_MANY_MEMBERS', { maximum: number; count: number }> {
  if (activeMemberCount < MIN_MEMBERS_TO_START) {
    return {
      ok: false,
      code: 'NOT_ENOUGH_MEMBERS',
      minimum: MIN_MEMBERS_TO_START,
      count: activeMemberCount,
    };
  }
  if (activeMemberCount > MAX_MEMBERS) {
    return { ok: false, code: 'TOO_MANY_MEMBERS', maximum: MAX_MEMBERS, count: activeMemberCount };
  }
  return { ok: true };
}

/** R2.1: a cycle has as many rounds as active members when it starts. */
export function roundCount(activeMemberCount: number): number {
  if (!Number.isSafeInteger(activeMemberCount) || activeMemberCount < 1) {
    throw new RangeError('a cycle needs at least one member');
  }
  return activeMemberCount;
}
