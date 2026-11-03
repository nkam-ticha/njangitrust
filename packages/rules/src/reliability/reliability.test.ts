import { describe, expect, it } from 'vitest';
import { reliabilityScore, roundItemOnTime, type ReliabilityItem } from './reliability';

const now = new Date('2026-12-01T00:00:00.000Z');
const item = (
  monthsAgo: number,
  onTime: boolean,
  kind: ReliabilityItem['kind'] = 'ROUND',
): ReliabilityItem => ({
  kind,
  dueAt: new Date(Date.UTC(2026, 10 - monthsAgo, 27, 17)),
  onTime,
});

describe('reliability score (R14)', () => {
  it('E10: 11 of 12 due items on time gives round(91.67) = 92', () => {
    const items = Array.from({ length: 12 }, (_, i) => item(i, i !== 3));
    expect(reliabilityScore({ items, reliabilityWindow: 12, now })).toEqual({
      kind: 'SCORE',
      score: 92,
      onTime: 11,
      due: 12,
    });
  });

  it('uses only the last reliabilityWindow items whose due date has passed', () => {
    const old = Array.from({ length: 6 }, (_, i) => item(i + 6, false));
    const recent = Array.from({ length: 6 }, (_, i) => item(i, true));
    const future = {
      kind: 'INSTALLMENT' as const,
      dueAt: new Date('2026-12-25T17:00:00.000Z'),
      onTime: false,
    };
    expect(
      reliabilityScore({ items: [...old, ...recent, future], reliabilityWindow: 6, now }),
    ).toEqual({
      kind: 'SCORE',
      score: 100,
      onTime: 6,
      due: 6,
    });
  });

  it('counts loan installments as items too, and rounds half up', () => {
    const items = [
      item(0, true),
      item(1, false, 'INSTALLMENT'),
      item(2, true),
      item(3, true),
      item(4, true),
      item(5, true),
      item(6, false),
      item(7, true),
    ];
    // 6 of 8 = 75
    expect(reliabilityScore({ items, reliabilityWindow: 12, now })).toMatchObject({ score: 75 });
    const half = [
      item(0, true),
      item(1, true),
      item(2, true),
      item(3, true),
      item(4, true),
      item(5, true),
      item(6, true),
      item(7, false),
    ];
    // 7 of 8 = 87.5 -> 88
    expect(reliabilityScore({ items: half, reliabilityWindow: 12, now })).toMatchObject({
      score: 88,
    });
  });

  it('shows "Nouveau membre" with fewer than 3 due items', () => {
    expect(
      reliabilityScore({ items: [item(0, true), item(1, true)], reliabilityWindow: 12, now }),
    ).toEqual({
      kind: 'NEW_MEMBER',
      due: 2,
    });
  });

  it('counts a round as on time only when its contribution and solidarity were both on time', () => {
    expect(roundItemOnTime({ contributionOnTime: true, solidarityOnTime: true })).toBe(true);
    expect(roundItemOnTime({ contributionOnTime: true, solidarityOnTime: false })).toBe(false);
    expect(roundItemOnTime({ contributionOnTime: true, solidarityOnTime: null })).toBe(true);
  });
});
