import { describe, expect, it } from 'vitest';
import { clamp, nudge, presetAmounts, ratioOf, snap, stepFor, valueAt } from './sliderMath';

describe('amount slider', () => {
  it('steps by 500 below 5 000 and by 1 000 from there', () => {
    expect(stepFor(1)).toBe(500);
    expect(stepFor(4999)).toBe(500);
    expect(stepFor(5000)).toBe(1000);
  });

  it('snaps to whole steps inside the server limits', () => {
    expect(snap(12_345, 1000, 30_000)).toBe(12_000);
    expect(snap(12_600, 1000, 30_000)).toBe(13_000);
    expect(snap(500, 1000, 30_000)).toBe(1000);
    expect(snap(99_999, 1000, 30_000)).toBe(30_000);
    expect(Number.isInteger(snap(1234.7, 1000, 30_000))).toBe(true);
  });

  it('moves one step with the arrows and ten with the page keys', () => {
    expect(nudge(10_000, 1, 1000, 30_000)).toBe(11_000);
    expect(nudge(10_000, -1, 1000, 30_000)).toBe(9000);
    expect(nudge(10_000, 1, 1000, 30_000, { times: 10 })).toBe(20_000);
    expect(nudge(25_000, 1, 1000, 30_000, { times: 10 })).toBe(30_000);
    expect(nudge(3000, -1, 1000, 30_000)).toBe(2500);
  });

  it('never leaves the limits', () => {
    expect(nudge(30_000, 1, 1000, 30_000)).toBe(30_000);
    expect(nudge(1000, -1, 1000, 30_000)).toBe(1000);
  });

  it('still moves when the value is off the grid, such as a maximum of 30 400', () => {
    expect(nudge(30_400, -1, 1000, 30_400)).toBe(29_000);
    expect(nudge(2900, 1, 1000, 30_400)).toBeGreaterThan(2900);
  });

  it('maps a position on the track to a value and back', () => {
    expect(valueAt(0, 1000, 30_000)).toBe(1000);
    expect(valueAt(1, 1000, 30_000)).toBe(30_000);
    expect(valueAt(0.5, 1000, 31_000)).toBe(16_000);
    expect(ratioOf(16_000, 1000, 31_000)).toBeCloseTo(0.5);
    expect(ratioOf(50_000, 1000, 30_000)).toBe(1);
    expect(ratioOf(5, 10, 10)).toBe(0);
    expect(clamp(5, 1, 3)).toBe(3);
  });

  it('offers presets below the limit only', () => {
    expect(presetAmounts(30_000)).toEqual([10_000, 25_000]);
    expect(presetAmounts(10_000)).toEqual([]);
    expect(presetAmounts(5_000_000)).toEqual([10_000, 25_000, 50_000]);
    expect(presetAmounts(5_000_000, 5)).toHaveLength(5);
  });
});
