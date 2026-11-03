// Rotation changes (R2.4, R11.1 ROTATION_CHANGE) and rounds removed by an exit (R12.3).

import type { Refusal } from '../result';

/** R11.1 ROTATION_CHANGE: members whose position differs between two orders (they must vote yes). */
export function positionsChanged(
  oldOrder: readonly string[],
  newOrder: readonly string[],
): string[] {
  const changed = new Set<string>();
  const length = Math.max(oldOrder.length, newOrder.length);
  for (let i = 0; i < length; i++) {
    const before = oldOrder[i];
    const after = newOrder[i];
    if (before === after) continue;
    if (before !== undefined) changed.add(before);
    if (after !== undefined) changed.add(after);
  }
  return [...changed].sort();
}

/** R2.4: the rotation with two members' positions swapped. */
export function applyRotationSwap(
  rotation: readonly string[],
  first: string,
  second: string,
): string[] {
  const i = rotation.indexOf(first);
  const j = rotation.indexOf(second);
  if (i < 0 || j < 0) throw new RangeError('both members must be in the rotation');
  const next = [...rotation];
  next[i] = second;
  next[j] = first;
  return next;
}

/**
 * R2.4, R11.1: validates a ROTATION_CHANGE swap. Both members must hold rounds after the current
 * one (the change applies from the next round). Returns the new order and who must vote yes.
 */
export function validateRotationSwap(input: {
  rotation: readonly string[];
  /** The round in progress (1-based); 0 before the cycle's first round. */
  currentRound: number;
  first: string;
  second: string;
}):
  | { ok: true; newOrder: string[]; mustApprove: string[] }
  | Refusal<'SAME_MEMBER'>
  | Refusal<'NOT_IN_ROTATION', { membershipId: string }>
  | Refusal<'ROTATION_POSITION_ALREADY_SERVED', { membershipId: string }> {
  if (input.first === input.second) return { ok: false, code: 'SAME_MEMBER' };
  for (const id of [input.first, input.second]) {
    const position = input.rotation.indexOf(id);
    if (position < 0) return { ok: false, code: 'NOT_IN_ROTATION', membershipId: id };
    if (position + 1 <= input.currentRound) {
      return { ok: false, code: 'ROTATION_POSITION_ALREADY_SERVED', membershipId: id };
    }
  }
  const newOrder = applyRotationSwap(input.rotation, input.first, input.second);
  return { ok: true, newOrder, mustApprove: positionsChanged(input.rotation, newOrder) };
}

/** R12.3: a member leaving before being served loses their round; later rounds move up. */
export function removeFromRotation(rotation: readonly string[], membershipId: string): string[] {
  if (!rotation.includes(membershipId)) throw new RangeError('member is not in the rotation');
  return rotation.filter((id) => id !== membershipId);
}
