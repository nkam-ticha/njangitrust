import { describe, expect, it } from 'vitest';
import { carryRotation, canCarryRotation } from './carry';

const at = (iso: string) => new Date(iso);

describe('the order kept from one cycle to the next (D40.3)', () => {
  it('keeps each remaining member in the same relative position and drops leavers', () => {
    const order = carryRotation({
      previousOrder: ['C', 'A', 'D', 'B', 'E'],
      participants: [
        { membershipId: 'A', joinedAt: at('2026-01-01T00:00:00Z') },
        { membershipId: 'B', joinedAt: at('2026-01-01T00:00:00Z') },
        { membershipId: 'E', joinedAt: at('2026-01-01T00:00:00Z') },
        { membershipId: 'C', joinedAt: at('2026-01-01T00:00:00Z') },
      ],
    });
    expect(order).toEqual(['C', 'A', 'B', 'E']);
  });

  it('appends newcomers at the end by join date, then membership id', () => {
    const order = carryRotation({
      previousOrder: ['B', 'A'],
      participants: [
        { membershipId: 'Z', joinedAt: at('2026-03-01T00:00:00Z') },
        { membershipId: 'A', joinedAt: at('2026-01-01T00:00:00Z') },
        { membershipId: 'Y', joinedAt: at('2026-03-01T00:00:00Z') },
        { membershipId: 'B', joinedAt: at('2026-01-01T00:00:00Z') },
        { membershipId: 'X', joinedAt: at('2026-04-01T00:00:00Z') },
        { membershipId: 'W', joinedAt: at('2026-02-01T00:00:00Z') },
      ],
    });
    expect(order).toEqual(['B', 'A', 'W', 'Y', 'Z', 'X']);
  });

  it('gives the same answer whatever order the participants arrive in', () => {
    const participants = ['A', 'B', 'C', 'N1', 'N2'].map((id, i) => ({
      membershipId: id,
      joinedAt: at(`2026-0${(i % 3) + 1}-01T00:00:00Z`),
    }));
    const a = carryRotation({ previousOrder: ['C', 'B', 'A'], participants });
    const b = carryRotation({
      previousOrder: ['C', 'B', 'A'],
      participants: [...participants].reverse(),
    });
    expect(a).toEqual(b);
    expect(a.slice(0, 3)).toEqual(['C', 'B', 'A']);
  });

  it('a cycle with only newcomers is ordered by join date then id', () => {
    expect(
      carryRotation({
        previousOrder: ['GONE'],
        participants: [
          { membershipId: 'B', joinedAt: at('2026-01-02T00:00:00Z') },
          { membershipId: 'A', joinedAt: at('2026-01-02T00:00:00Z') },
          { membershipId: 'C', joinedAt: at('2026-01-01T00:00:00Z') },
        ],
      }),
    ).toEqual(['C', 'A', 'B']);
  });

  it('refuses repeated ids and returns nothing for nobody', () => {
    expect(() =>
      carryRotation({
        previousOrder: ['A', 'A'],
        participants: [{ membershipId: 'A', joinedAt: at('2026-01-01T00:00:00Z') }],
      }),
    ).toThrow(RangeError);
    expect(() =>
      carryRotation({
        previousOrder: [],
        participants: [
          { membershipId: 'A', joinedAt: at('2026-01-01T00:00:00Z') },
          { membershipId: 'A', joinedAt: at('2026-01-01T00:00:00Z') },
        ],
      }),
    ).toThrow(RangeError);
    expect(carryRotation({ previousOrder: ['A'], participants: [] })).toEqual([]);
  });

  it('the order is only kept after a FIXED cycle that had one (Q1)', () => {
    expect(canCarryRotation({ previousMode: 'FIXED', previousOrder: ['A', 'B'] })).toBe(true);
    expect(canCarryRotation({ previousMode: 'FIXED', previousOrder: [] })).toBe(false);
    expect(canCarryRotation({ previousMode: 'BIDDING', previousOrder: ['A', 'B'] })).toBe(false);
    expect(canCarryRotation({ previousMode: null, previousOrder: [] })).toBe(false);
  });
});
