import { describe, expect, it } from 'vitest';
import { assertFcfa, floorDiv, isFcfa, mulDivFloor, roundHalfUpDiv, sumFcfa } from './amounts';

describe('integer FCFA helpers (3.3)', () => {
  it('accepts only safe integers as amounts', () => {
    expect(isFcfa(0)).toBe(true);
    expect(isFcfa(10_000)).toBe(true);
    expect(isFcfa(-500)).toBe(true);
    expect(isFcfa(1.5)).toBe(false);
    expect(isFcfa(Number.NaN)).toBe(false);
    expect(isFcfa(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFcfa(2 ** 53)).toBe(false);
    expect(() => assertFcfa(0.1 + 0.2)).toThrow(RangeError);
    expect(() => assertFcfa(100)).not.toThrow();
  });

  it('sums amounts exactly and refuses fractions', () => {
    expect(sumFcfa([10_000, 1_000, -100])).toBe(10_900);
    expect(sumFcfa([])).toBe(0);
    expect(() => sumFcfa([1, 0.5])).toThrow(RangeError);
  });

  it('keeps products above 2^53 exact in mulDivFloor', () => {
    // 9e12 × 3 000 = 2.7e16 is above 2^53; BigInt keeps the intermediate exact.
    expect(mulDivFloor(9_000_000_000_001, 3000, 1000)).toBe(27_000_000_000_003);
    expect(mulDivFloor(100, 10_000, 11_000)).toBe(90);
    expect(mulDivFloor(7, 1, 2)).toBe(3);
  });

  it('divides exactly with floorDiv', () => {
    expect(floorDiv(33_500, 2)).toBe(16_750);
    expect(floorDiv(12_001, 3)).toBe(4_000);
    expect(floorDiv(9_007_199_254_740_991, 2)).toBe(4_503_599_627_370_495);
    expect(() => floorDiv(1, 0)).toThrow(RangeError);
  });

  it('rounds half up (interest R7.3, reliability R14.1)', () => {
    expect(roundHalfUpDiv(5, 2)).toBe(3); // 2.5 -> 3
    expect(roundHalfUpDiv(4, 2)).toBe(2);
    expect(roundHalfUpDiv(7, 3)).toBe(2); // 2.33
    expect(roundHalfUpDiv(8, 3)).toBe(3); // 2.67
    expect(roundHalfUpDiv(0, 7)).toBe(0);
    expect(roundHalfUpDiv(1_100, 12)).toBe(92); // 91.67 (E10)
    expect(() => roundHalfUpDiv(1, 0)).toThrow(RangeError);
    expect(() => roundHalfUpDiv(-1, 2)).toThrow(RangeError);
  });
});
