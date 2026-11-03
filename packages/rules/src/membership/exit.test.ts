import { describe, expect, it } from 'vitest';
import { exitSettlement } from './exit';

const now = new Date('2026-11-29T09:00:00.000Z');
const nextRoundDueAt = new Date('2026-12-25T17:00:00.000Z');
const remaining = ['M3', 'M10', 'M1', 'M9', 'M8', 'M2', 'M5', 'M7', 'M4']; // rotation order without M6
const fine = {
  id: 'f6',
  kind: 'FINE' as const,
  amount: 1_000,
  dueAt: new Date('2026-10-30T17:00:00.000Z'),
};

describe('leaving mid-cycle or removal (R12.3)', () => {
  it('E9: refunds 25 000 from the fund, settles the fine, and splits the 15 000 shortfall over nine', () => {
    const result = exitSettlement({
      served: false,
      contributionsPaidThisCycle: 40_000,
      availableForLoans: 25_000,
      leaverPayableBalance: 0,
      leaverDebts: [fine],
      remainingMembershipIds: remaining,
      nextRoundDueAt,
      now,
    });
    expect(result).toEqual({
      kind: 'NOT_SERVED',
      refund: 40_000,
      fromFund: 25_000,
      shortfall: 15_000,
      settlement: { settled: [fine], total: 1_000, remainingPayable: 24_000, notCovered: [] },
      payableAfter: 24_000,
      shortfallShares: [
        { membershipId: 'M3', amount: 1_667, dueAt: nextRoundDueAt },
        { membershipId: 'M10', amount: 1_667, dueAt: nextRoundDueAt },
        { membershipId: 'M1', amount: 1_667, dueAt: nextRoundDueAt },
        { membershipId: 'M9', amount: 1_667, dueAt: nextRoundDueAt },
        { membershipId: 'M8', amount: 1_667, dueAt: nextRoundDueAt },
        { membershipId: 'M2', amount: 1_667, dueAt: nextRoundDueAt },
        { membershipId: 'M5', amount: 1_666, dueAt: nextRoundDueAt },
        { membershipId: 'M7', amount: 1_666, dueAt: nextRoundDueAt },
        { membershipId: 'M4', amount: 1_666, dueAt: nextRoundDueAt },
      ],
    });
  });

  it('needs no shortfall when the fund can refund everything', () => {
    const result = exitSettlement({
      served: false,
      contributionsPaidThisCycle: 40_000,
      availableForLoans: 100_000,
      leaverPayableBalance: 0,
      leaverDebts: [],
      remainingMembershipIds: remaining,
      nextRoundDueAt,
      now,
    });
    expect(result).toMatchObject({
      fromFund: 40_000,
      shortfall: 0,
      shortfallShares: [],
      payableAfter: 40_000,
    });
  });

  it('keeps a served member’s remaining contributions owed to their rounds’ beneficiaries', () => {
    expect(
      exitSettlement({
        served: true,
        contributionsPaidThisCycle: 40_000,
        availableForLoans: 25_000,
        leaverPayableBalance: 0,
        leaverDebts: [fine],
        remainingMembershipIds: remaining,
        nextRoundDueAt,
        now,
      }),
    ).toEqual({ kind: 'SERVED', contributionsStayOwed: true });
  });

  it('refunds nothing to a member who paid nothing this cycle', () => {
    const result = exitSettlement({
      served: false,
      contributionsPaidThisCycle: 0,
      availableForLoans: 25_000,
      leaverPayableBalance: 0,
      leaverDebts: [],
      remainingMembershipIds: remaining,
      nextRoundDueAt,
      now,
    });
    expect(result).toMatchObject({ refund: 0, fromFund: 0, shortfall: 0, shortfallShares: [] });
  });
});
