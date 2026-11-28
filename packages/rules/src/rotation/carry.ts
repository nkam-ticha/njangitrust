// The rotation order of a later cycle (D40.3): kept, not drawn again.

import type { RotationMode } from '../ruleset';

/**
 * D40.3: each remaining member keeps their relative position from the previous cycle's final order
 * (after exits and any ROTATION_CHANGE); members who left are dropped; newcomers go at the end,
 * oldest join date first, then membership id. Deterministic: the same inputs always give the same
 * order, whatever order the participants are listed in.
 */
export function carryRotation(input: {
  previousOrder: readonly string[];
  participants: readonly { membershipId: string; joinedAt: Date }[];
}): string[] {
  if (new Set(input.previousOrder).size !== input.previousOrder.length) {
    throw new RangeError('the previous order repeats a membership');
  }
  const joined = new Map<string, number>();
  for (const p of input.participants) {
    if (joined.has(p.membershipId)) throw new RangeError(`duplicate membership ${p.membershipId}`);
    const at = p.joinedAt.getTime();
    if (!Number.isFinite(at)) throw new RangeError('joinedAt must be a valid date');
    joined.set(p.membershipId, at);
  }
  const kept = input.previousOrder.filter((id) => joined.has(id));
  const keptSet = new Set(kept);
  const newcomers = [...joined.keys()]
    .filter((id) => !keptSet.has(id))
    .sort((a, b) => joined.get(a)! - joined.get(b)! || (a < b ? -1 : a > b ? 1 : 0));
  return [...kept, ...newcomers];
}

/**
 * D40.3, Q1: the order is kept only after a FIXED cycle that had one. After a BIDDING cycle (no
 * order) or when there is no previous cycle, the order is drawn (R2.3).
 */
export function canCarryRotation(input: {
  previousMode: RotationMode | null;
  previousOrder: readonly string[];
}): boolean {
  return input.previousMode === 'FIXED' && input.previousOrder.length > 0;
}
