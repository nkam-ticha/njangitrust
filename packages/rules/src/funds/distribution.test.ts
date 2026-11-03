import { describe, expect, it } from 'vitest';
import { fundDistribution, type DistributionCandidate } from './distribution';

const members = (
  n: number,
  overrides: Partial<DistributionCandidate>[] = [],
): DistributionCandidate[] =>
  Array.from({ length: n }, (_, i) => ({
    membershipId: `M${i + 1}`,
    activeWholeCycle: true,
    outstandingDebt: 0,
    ...overrides[i],
  }));

describe('end-of-cycle distribution of the general fund (R9.3, R9.4, R7.8)', () => {
  it('E8: 37 003 FCFA among 9 eligible members gives 4 111 each and leaves 4 in the fund', () => {
    const candidates = members(10, [
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      { outstandingDebt: 16_750 },
    ]);
    expect(
      fundDistribution({
        distributeFundAtCycleEnd: true,
        generalFundBalance: 53_753,
        outstandingReceivables: 16_750,
        availableForLoans: 37_003,
        candidates,
      }),
    ).toEqual({
      ok: true,
      distributable: 37_003,
      share: 4_111,
      shares: candidates.slice(0, 9).map((m) => ({ membershipId: m.membershipId, amount: 4_111 })),
      distributed: 36_999,
      remainder: 4,
    });
  });

  it('counts only money actually collected: the fund balance minus debts still owed to it', () => {
    const result = fundDistribution({
      distributeFundAtCycleEnd: true,
      generalFundBalance: 10_000,
      outstandingReceivables: 9_000,
      availableForLoans: 50_000,
      candidates: members(3),
    });
    expect(result).toMatchObject({
      ok: true,
      distributable: 1_000,
      share: 333,
      distributed: 999,
      remainder: 1,
    });
  });

  it('excludes members who left or joined during the cycle, and members with debt', () => {
    const result = fundDistribution({
      distributeFundAtCycleEnd: true,
      generalFundBalance: 9_000,
      outstandingReceivables: 0,
      availableForLoans: 9_000,
      candidates: members(3, [{ activeWholeCycle: false }, { outstandingDebt: 1 }]),
    });
    expect(result).toMatchObject({ ok: true, shares: [{ membershipId: 'M3', amount: 9_000 }] });
  });

  it('never distributes money that is in flight or reserved', () => {
    const result = fundDistribution({
      distributeFundAtCycleEnd: true,
      generalFundBalance: 30_000,
      outstandingReceivables: 0,
      availableForLoans: 20_000,
      candidates: members(2),
    });
    expect(result).toMatchObject({ ok: true, distributable: 20_000, share: 10_000 });
  });

  it('distributes nothing when the group turned it off, the fund is empty or nobody is eligible', () => {
    const base = {
      generalFundBalance: 9_000,
      outstandingReceivables: 0,
      availableForLoans: 9_000,
      candidates: members(3),
    };
    expect(fundDistribution({ ...base, distributeFundAtCycleEnd: false })).toEqual({
      ok: false,
      code: 'DISTRIBUTION_OFF',
    });
    expect(
      fundDistribution({ ...base, distributeFundAtCycleEnd: true, outstandingReceivables: 9_000 }),
    ).toEqual({
      ok: false,
      code: 'NOTHING_TO_DISTRIBUTE',
    });
    expect(
      fundDistribution({
        ...base,
        distributeFundAtCycleEnd: true,
        candidates: members(1, [{ outstandingDebt: 5 }]),
      }),
    ).toEqual({ ok: false, code: 'NO_ELIGIBLE_MEMBER' });
    expect(
      fundDistribution({
        ...base,
        distributeFundAtCycleEnd: true,
        generalFundBalance: 2,
        availableForLoans: 2,
      }),
    ).toEqual({ ok: false, code: 'NOTHING_TO_DISTRIBUTE' });
  });
});
