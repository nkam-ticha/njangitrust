import { describe, expect, it } from 'vitest';
import { memberReliability, reliabilityItemsOf } from './reliability-items';
import type { ObligationFact } from './types';

const NOW = new Date('2026-12-01T00:00:00.000Z');

function roundFacts(n: number, onTime: boolean, solidarityOnTime = onTime): ObligationFact[] {
  const dueAt = new Date(Date.UTC(2026, 10 - n, 20, 17)).toISOString();
  const base = {
    membershipId: 'M1',
    roundId: `R${n}`,
    roundNumber: n,
    dueAt,
    status: 'PAID' as const,
    paidAt: dueAt,
  };
  return [
    { ...base, id: `c${n}`, kind: 'CONTRIBUTION', amount: 10_000, onTime },
    { ...base, id: `s${n}`, kind: 'SOLIDARITY', amount: 1_000, onTime: solidarityOnTime },
  ];
}

describe('reliability from obligations (R14)', () => {
  it('E10: 12 due items, 11 on time, gives 92', () => {
    const facts = Array.from({ length: 12 }, (_, i) => roundFacts(i, i !== 3)).flat();
    expect(memberReliability({ facts, reliabilityWindow: 12, now: NOW })).toEqual({
      newMember: false,
      score: 92,
      onTime: 11,
      due: 12,
      window: 12,
    });
  });

  it('counts a round once, however many of its obligations there are, and it is late if either is', () => {
    const items = reliabilityItemsOf([...roundFacts(1, true, false), ...roundFacts(2, true)]);
    expect(items.map((i) => [i.kind, i.onTime])).toEqual([
      ['ROUND', false],
      ['ROUND', true],
    ]);
  });

  it('leaves out a round that has only a solidarity obligation: no contribution is assumed on time', () => {
    const solidarityOnly = roundFacts(3, true).filter((o) => o.kind === 'SOLIDARITY');
    const items = reliabilityItemsOf([
      ...roundFacts(1, true),
      ...solidarityOnly,
      ...roundFacts(2, false),
    ]);
    expect(items.map((i) => [i.kind, i.onTime])).toEqual([
      ['ROUND', true],
      ['ROUND', false],
    ]);
  });

  it('counts a loan installment as one item', () => {
    const installment: ObligationFact = {
      id: 'i1',
      membershipId: 'M1',
      kind: 'LOAN_INSTALLMENT',
      amount: 16_750,
      roundId: null,
      roundNumber: null,
      dueAt: '2026-11-20T17:00:00.000Z',
      status: 'SETTLED',
      paidAt: '2026-11-20T17:00:00.000Z',
      onTime: true,
    };
    expect(reliabilityItemsOf([installment]).map((i) => i.kind)).toEqual(['INSTALLMENT']);
  });

  it('treats an unpaid obligation past its due date as late and skips cancelled ones', () => {
    const unpaid: ObligationFact = {
      id: 'u',
      membershipId: 'M1',
      kind: 'CONTRIBUTION',
      amount: 10_000,
      roundId: 'R9',
      roundNumber: 9,
      dueAt: '2026-11-20T17:00:00.000Z',
      status: 'DUE',
      paidAt: null,
      onTime: null,
    };
    const cancelled = {
      ...unpaid,
      id: 'x',
      roundId: 'R8',
      roundNumber: 8,
      status: 'CANCELLED' as const,
    };
    expect(reliabilityItemsOf([unpaid, cancelled]).map((i) => i.onTime)).toEqual([false]);
  });

  it('R14.2: fewer than 3 due items is a new member without a score', () => {
    const facts = [...roundFacts(1, true), ...roundFacts(2, false)];
    expect(memberReliability({ facts, reliabilityWindow: 12, now: NOW })).toEqual({
      newMember: true,
      score: null,
      onTime: 0,
      due: 2,
      window: 12,
    });
  });

  it('ignores items not yet due', () => {
    const future = roundFacts(-2, false);
    expect(memberReliability({ facts: future, reliabilityWindow: 12, now: NOW }).due).toBe(0);
  });
});
