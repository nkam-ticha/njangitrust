import { describe, expect, it } from 'vitest';
import { canStartCycle, roundCount } from './cycle';

describe('cycle start (R1.1, R2.1)', () => {
  it('needs 3 to 50 active members', () => {
    expect(canStartCycle(2)).toEqual({
      ok: false,
      code: 'NOT_ENOUGH_MEMBERS',
      minimum: 3,
      count: 2,
    });
    expect(canStartCycle(3)).toEqual({ ok: true });
    expect(canStartCycle(50)).toEqual({ ok: true });
    expect(canStartCycle(51)).toEqual({
      ok: false,
      code: 'TOO_MANY_MEMBERS',
      maximum: 50,
      count: 51,
    });
  });

  it('has as many rounds as active members', () => {
    expect(roundCount(10)).toBe(10);
    expect(() => roundCount(0)).toThrow(RangeError);
  });
});
