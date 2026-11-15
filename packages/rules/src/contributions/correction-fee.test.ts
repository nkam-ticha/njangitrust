import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  collectionFeeShares,
  MOCK_FEE_SCHEDULE,
  scheduleFee,
  validateFeeSchedule,
  type FeeSchedule,
} from '../fees';
import { preparePayment, proposeRoundToPay, type OpenObligation } from './payment-selection';

const now = new Date('2026-12-01T09:00:00.000Z');
const ob = (
  id: string,
  kind: OpenObligation['kind'],
  amount: number,
  extra: Partial<OpenObligation> = {},
): OpenObligation => ({
  id,
  kind,
  membershipId: 'M7',
  amount,
  dueAt: new Date('2026-11-27T17:00:00.000Z'),
  roundId: null,
  roundNumber: null,
  creditorMembershipId: null,
  status: 'DUE',
  inPendingPayment: false,
  ...extra,
});
const correction = ob('k1', 'CORRECTION', 5_591);
const pay = (obligations: OpenObligation[], feeSchedule: FeeSchedule = MOCK_FEE_SCHEDULE) =>
  preparePayment({ payerMembershipId: 'M7', obligations, feeSchedule });

describe('a correction debt repaid by request: the member bears the fee (D22.2)', () => {
  it('adds the collection fee to the card: debt 5 591 + fee 100 = 5 691', () => {
    expect(pay([correction])).toEqual({
      ok: true,
      total: 5_691,
      parts: [
        {
          kind: 'DEBT',
          amount: 5_691,
          feeCharged: 100,
          roundId: null,
          creditorMembershipId: null,
          ref: 'k1',
        },
      ],
    });
  });

  it('charges only the correction’s own fee share when paid with a round (R4.2 split)', () => {
    const round = [
      ob('c4', 'CONTRIBUTION', 10_000, { roundId: 'r4', creditorMembershipId: 'M2' }),
      ob('s4', 'SOLIDARITY', 1_000, { roundId: 'r4' }),
    ];
    const result = pay([...round, ob('k2', 'CORRECTION', 1_000)]);
    // Fee 100 over 10 000, 1 000 and 1 009: shares 83, 8 and 9 (largest remainder); the member
    // adds the correction's 9, which is exactly its share of the fee on the larger card.
    expect(result).toMatchObject({ ok: true, total: 12_009 });
    expect(result.ok && result.parts[2]).toMatchObject({
      kind: 'DEBT',
      amount: 1_009,
      feeCharged: 9,
    });
  });

  it('keeps R4.2 for other debts: fines, bids and installments carry no surcharge', () => {
    const result = pay([ob('f1', 'FINE', 1_000), ob('i1', 'LOAN_INSTALLMENT', 2_000)]);
    expect(result).toMatchObject({ ok: true, total: 3_000 });
    expect(result.ok && result.parts.every((p) => p.feeCharged === undefined)).toBe(true);
  });

  it('finds a surcharge that covers its own fee with rate-based fees', () => {
    const rate: FeeSchedule = {
      ...MOCK_FEE_SCHEDULE,
      collection: [{ upTo: null, fixed: 0, ratePermille: 20 }],
    };
    // 2 % of 10 000 is 200; of 10 204 it is 204.08 → 204: the member pays 10 204.
    expect(pay([ob('k3', 'CORRECTION', 10_000)], rate)).toMatchObject({ ok: true, total: 10_204 });
  });

  it('needs the fee schedule to price a correction debt', () => {
    expect(() => preparePayment({ payerMembershipId: 'M7', obligations: [correction] })).toThrow(
      RangeError,
    );
  });
});

describe('installments of a loan still in flight are not paid yet (L2)', () => {
  const inFlight = ob('i2', 'LOAN_INSTALLMENT', 2_000, { loanInFlight: true });

  it('refuses them in a payment request', () => {
    expect(pay([inFlight])).toEqual({ ok: false, code: 'LOAN_IN_FLIGHT', obligationId: 'i2' });
  });

  it('leaves them out of the due debts proposed with a round', () => {
    const round = [
      ob('c4', 'CONTRIBUTION', 10_000, { roundId: 'r4', creditorMembershipId: 'M2' }),
      ob('s4', 'SOLIDARITY', 1_000, { roundId: 'r4' }),
    ];
    expect(proposeRoundToPay([...round, inFlight], { now, includeDueDebts: true })).toMatchObject({
      obligationIds: ['c4', 's4'],
      total: 11_000,
    });
  });
});

describe('a correction debt smaller than the fee (D22.2)', () => {
  it('still covers the whole fee: debt 1 + fee 100', () => {
    expect(pay([ob('k4', 'CORRECTION', 1)])).toMatchObject({ ok: true, total: 101 });
  });
});

describe('the proposed card prices a correction debt like the payment (audit 5 N2, R4.5)', () => {
  const round = [
    ob('c4', 'CONTRIBUTION', 10_000, { roundId: 'r4', creditorMembershipId: 'M2' }),
    ob('s4', 'SOLIDARITY', 1_000, { roundId: 'r4' }),
  ];
  const debt = ob('k2', 'CORRECTION', 1_000);

  it('shows the same total as preparePayment, the fee included', () => {
    const proposal = proposeRoundToPay([...round, debt], {
      now,
      includeDueDebts: true,
      feeSchedule: MOCK_FEE_SCHEDULE,
    });
    expect(proposal).toMatchObject({ obligationIds: ['c4', 's4', 'k2'], total: 12_009 });
    expect(pay([...round, debt])).toMatchObject({ ok: true, total: 12_009 });
  });

  it('needs the fee schedule only when a correction debt is proposed', () => {
    expect(() => proposeRoundToPay([...round, debt], { now, includeDueDebts: true })).toThrow(
      RangeError,
    );
    expect(proposeRoundToPay([...round, debt], { now })).toMatchObject({ total: 11_000 });
  });
});

const decreasing: FeeSchedule = {
  ...MOCK_FEE_SCHEDULE,
  collection: [
    { upTo: 10_000, fixed: 300, ratePermille: 0 },
    { upTo: null, fixed: 100, ratePermille: 0 },
  ],
};

describe('the correction fee is its share of the whole card fee (audit 5 N4, owner Q4)', () => {
  it('refuses a fee schedule whose fee goes down as the amount grows', () => {
    expect(validateFeeSchedule(decreasing)).toEqual({
      ok: false,
      code: 'INVALID_FEE_SCHEDULE',
      reason: expect.stringContaining('never decrease'),
    });
    // With it, a 9 800 debt would be charged 300 while the card's fee is only 100.
    expect(() => pay([ob('k5', 'CORRECTION', 9_800)], decreasing)).toThrow(RangeError);
  });

  it('charges the least surcharge that covers its own share (property, brute force)', () => {
    const tiers = fc.record({
      first: fc.record({
        upTo: fc.integer({ min: 1, max: 30_000 }),
        fixed: fc.integer({ min: 0, max: 300 }),
        ratePermille: fc.integer({ min: 0, max: 40 }),
      }),
      extraFixed: fc.integer({ min: 0, max: 300 }),
      ratePermille: fc.integer({ min: 0, max: 40 }),
    });
    fc.assert(
      fc.property(
        tiers,
        fc.integer({ min: 1, max: 40_000 }),
        fc.array(fc.integer({ min: 1, max: 20_000 }), { maxLength: 3 }),
        (t, debt, others) => {
          // Non-decreasing by construction: the second tier starts at least at the first's top fee.
          const top =
            t.first.fixed + Math.floor((t.first.upTo * t.first.ratePermille + 500) / 1000);
          const schedule: FeeSchedule = {
            ...MOCK_FEE_SCHEDULE,
            collection: [
              t.first,
              { upTo: null, fixed: top + t.extraFixed, ratePermille: t.ratePermille },
            ],
          };
          const obligations = [
            ...others.map((amount, i) => ob(`f${i}`, 'FINE', amount)),
            ob('k', 'CORRECTION', debt),
          ];
          const result = pay(obligations, schedule);
          if (!result.ok) throw new Error('refused');
          const charged = result.parts.at(-1)!.feeCharged ?? 0;
          const shareAt = (c: number) => {
            const amounts = [...others, debt + c];
            const total = amounts.reduce((s, a) => s + a, 0);
            const fee = scheduleFee(schedule, 'COLLECTION', total);
            if (fee > total) return Number.POSITIVE_INFINITY;
            return collectionFeeShares(
              amounts.map((amount, i) => ({ kind: 'DEBT' as const, amount, tieOrder: i })),
              fee,
            ).at(-1)!;
          };
          expect(shareAt(charged)).toBeLessThanOrEqual(charged);
          for (let c = 0; c < charged; c++) expect(shareAt(c), `surcharge ${c}`).toBeGreaterThan(c);
        },
      ),
      { numRuns: 200 },
    );
  }, 60_000);
});
