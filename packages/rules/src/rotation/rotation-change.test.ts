import { describe, expect, it } from 'vitest';
import {
  applyRotationSwap,
  positionsChanged,
  removeFromRotation,
  validateRotationSwap,
} from './rotation-change';

describe('rotation changes (R2.4, R11.1 ROTATION_CHANGE, R12.3)', () => {
  const rotation = ['a', 'b', 'c', 'd', 'e'];

  it('swaps two members whose rounds come after the current one', () => {
    expect(validateRotationSwap({ rotation, currentRound: 2, first: 'c', second: 'e' })).toEqual({
      ok: true,
      newOrder: ['a', 'b', 'e', 'd', 'c'],
      mustApprove: ['c', 'e'],
    });
  });

  it('refuses served or current positions, unknown members and self-swaps', () => {
    expect(validateRotationSwap({ rotation, currentRound: 2, first: 'b', second: 'e' })).toEqual({
      ok: false,
      code: 'ROTATION_POSITION_ALREADY_SERVED',
      membershipId: 'b',
    });
    expect(validateRotationSwap({ rotation, currentRound: 2, first: 'c', second: 'z' })).toEqual({
      ok: false,
      code: 'NOT_IN_ROTATION',
      membershipId: 'z',
    });
    expect(validateRotationSwap({ rotation, currentRound: 2, first: 'c', second: 'c' })).toEqual({
      ok: false,
      code: 'SAME_MEMBER',
    });
  });

  it('lists every member whose position changes, without mutating the rotation', () => {
    expect(positionsChanged(rotation, ['a', 'b', 'e', 'd', 'c'])).toEqual(['c', 'e']);
    expect(positionsChanged(rotation, rotation)).toEqual([]);
    expect(applyRotationSwap(rotation, 'a', 'b')).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(rotation).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('removes the round of a member who leaves before being served (one round fewer)', () => {
    expect(removeFromRotation(rotation, 'c')).toEqual(['a', 'b', 'd', 'e']);
    expect(() => removeFromRotation(rotation, 'z')).toThrow(RangeError);
  });
});
