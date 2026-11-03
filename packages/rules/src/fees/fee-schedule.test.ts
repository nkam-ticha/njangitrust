import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  feeDifference,
  maxAmountWithinFee,
  MOCK_FEE_SCHEDULE,
  resolveFee,
  scheduleFee,
  validateFeeSchedule,
  type FeeSchedule,
} from './fee-schedule';

const tiered: FeeSchedule = {
  collection: [{ upTo: null, fixed: 0, ratePermille: 10 }],
  disbursement: [
    { upTo: 10_000, fixed: 100, ratePermille: 0 },
    { upTo: null, fixed: 0, ratePermille: 15 },
  ],
};

describe('fee schedule (R4.4, spec 2.6)', () => {
  it('has the MockProvider fixture fees: 100 per collection, 500 per disbursement', () => {
    expect(scheduleFee(MOCK_FEE_SCHEDULE, 'COLLECTION', 11_000)).toBe(100);
    expect(scheduleFee(MOCK_FEE_SCHEDULE, 'DISBURSEMENT', 80_840)).toBe(500);
    expect(validateFeeSchedule(MOCK_FEE_SCHEDULE)).toEqual({ ok: true });
  });

  it('picks the first tier that covers the amount and rounds rate fees half up', () => {
    expect(scheduleFee(tiered, 'DISBURSEMENT', 10_000)).toBe(100);
    expect(scheduleFee(tiered, 'DISBURSEMENT', 10_001)).toBe(150); // 150.015
    expect(scheduleFee(tiered, 'DISBURSEMENT', 19_705)).toBe(296); // 295.575
    expect(scheduleFee(tiered, 'COLLECTION', 50)).toBe(1); // 0.5 rounds up
  });

  it('refuses malformed schedules', () => {
    const bad = (s: unknown) => validateFeeSchedule(s as FeeSchedule);
    expect(bad({ collection: [], disbursement: tiered.disbursement })).toMatchObject({
      ok: false,
      code: 'INVALID_FEE_SCHEDULE',
    });
    expect(
      bad({
        collection: [{ upTo: 10, fixed: 0, ratePermille: 0 }],
        disbursement: tiered.disbursement,
      }),
    ).toMatchObject({ code: 'INVALID_FEE_SCHEDULE' }); // last tier must be open-ended
    expect(
      bad({
        collection: [{ upTo: null, fixed: 1.5, ratePermille: 0 }],
        disbursement: tiered.disbursement,
      }),
    ).toMatchObject({ code: 'INVALID_FEE_SCHEDULE' });
    expect(
      bad({
        collection: tiered.collection,
        disbursement: [
          { upTo: 500, fixed: 1, ratePermille: 0 },
          { upTo: 100, fixed: 1, ratePermille: 0 },
          { upTo: null, fixed: 1, ratePermille: 0 },
        ],
      }),
    ).toMatchObject({ code: 'INVALID_FEE_SCHEDULE' });
  });

  it('uses the provider fee when given, else the schedule, and says which', () => {
    const args = { schedule: MOCK_FEE_SCHEDULE, kind: 'COLLECTION', amount: 11_000 } as const;
    expect(resolveFee({ ...args, providerFee: 120 })).toEqual({ fee: 120, feeSource: 'PROVIDER' });
    expect(resolveFee({ ...args, providerFee: null })).toEqual({ fee: 100, feeSource: 'SCHEDULE' });
    expect(() => resolveFee({ ...args, providerFee: -1 })).toThrow(RangeError);
  });
});

describe('disbursement fee (R4.3)', () => {
  it('finds the largest amount whose amount plus estimated fee fits (E5: 81 340 -> 80 840)', () => {
    expect(maxAmountWithinFee(81_340, MOCK_FEE_SCHEDULE)).toBe(80_840);
    expect(maxAmountWithinFee(500, MOCK_FEE_SCHEDULE)).toBe(0);
    expect(maxAmountWithinFee(0, MOCK_FEE_SCHEDULE)).toBe(0);
    expect(maxAmountWithinFee(10_100, tiered)).toBe(10_000);
    expect(maxAmountWithinFee(20_000, tiered)).toBe(19_704);
  });

  it('never leaves a larger amount that would still fit (property, brute force)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 25_000 }), (spendable) => {
        const best = maxAmountWithinFee(spendable, tiered);
        const fits = (w: number) => w + scheduleFee(tiered, 'DISBURSEMENT', w) <= spendable;
        if (best > 0) expect(fits(best)).toBe(true);
        for (let w = best + 1; w <= spendable; w += 97) expect(fits(w)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it('records the difference between actual and estimated fee for the general fund', () => {
    expect(feeDifference(500, 500)).toBe(0);
    expect(feeDifference(500, 650)).toBe(150);
    expect(feeDifference(500, 400)).toBe(-100);
  });
});
