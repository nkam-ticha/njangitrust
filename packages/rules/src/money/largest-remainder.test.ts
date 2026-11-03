import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { largestRemainderSplit, splitEqually } from './largest-remainder';

describe('largest remainder split (3.3)', () => {
  it('splits a fee of 100 over 10 000 + 1 000 as 91 and 9 (E1)', () => {
    expect(largestRemainderSplit(100, [10_000, 1_000])).toEqual([91, 9]);
  });

  it('gives the franc to the first share in tie order when fractions are equal (E4)', () => {
    expect(largestRemainderSplit(100, [10_000, 1_000, 1_000])).toEqual([84, 8, 8]);
  });

  it('splits 15 000 over 9 members with 1 667 for the first six (E9)', () => {
    expect(splitEqually(15_000, 9)).toEqual([1667, 1667, 1667, 1667, 1667, 1667, 1666, 1666, 1666]);
  });

  it('serves larger fractional parts before tie order', () => {
    // exact 2.4 and 3.6: floors 2 and 3, the last franc goes to 0.6
    expect(largestRemainderSplit(6, [2, 3])).toEqual([2, 4]);
  });

  it('handles zero totals and zero weights, and refuses bad input', () => {
    expect(largestRemainderSplit(0, [5, 5])).toEqual([0, 0]);
    expect(largestRemainderSplit(10, [0, 5])).toEqual([0, 10]);
    expect(() => largestRemainderSplit(10, [0, 0])).toThrow(RangeError);
    expect(() => largestRemainderSplit(10, [])).toThrow(RangeError);
    expect(() => largestRemainderSplit(10, [-1, 2])).toThrow(RangeError);
    expect(() => largestRemainderSplit(1.5, [1])).toThrow(RangeError);
    expect(splitEqually(0, 3)).toEqual([0, 0, 0]);
    expect(() => splitEqually(10, 0)).toThrow(RangeError);
  });

  it('is exact for large amounts', () => {
    expect(largestRemainderSplit(1_000_000_000_000, [999_999_999, 1_000_000_001])).toEqual([
      499_999_999_500, 500_000_000_500,
    ]);
  });

  it('always sums to the total with each share at floor or floor + 1 (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.array(fc.integer({ min: 0, max: 5_000_000 }), { minLength: 1, maxLength: 12 }),
        (total, weights) => {
          fc.pre(weights.some((w) => w > 0));
          const shares = largestRemainderSplit(total, weights);
          const W = BigInt(weights.reduce((a, b) => a + b, 0));
          expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
          shares.forEach((s, i) => {
            const floor = Number((BigInt(total) * BigInt(weights[i]!)) / W);
            expect(s === floor || s === floor + 1).toBe(true);
          });
        },
      ),
    );
  });

  it('gives the extra francs of an equal split to the earliest positions (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 50 }),
        (t, n) => {
          const shares = splitEqually(t, n);
          const extra = t % n;
          const base = (t - extra) / n;
          shares.forEach((s, i) => expect(s).toBe(i < extra ? base + 1 : base));
        },
      ),
    );
  });
});
