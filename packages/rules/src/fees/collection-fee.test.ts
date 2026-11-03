import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { splitCollectionFee, type PaymentPart } from './collection-fee';

const contribution = (amount: number, creditor = 'M7', tieOrder = 4): PaymentPart => ({
  kind: 'CONTRIBUTION',
  amount,
  creditorMembershipId: creditor,
  tieOrder,
});

describe('collection fee split (R4.2)', () => {
  it('splits 100 over contribution 10 000 and solidarity 1 000 as 91 and 9 (E1)', () => {
    const parts = splitCollectionFee(
      [contribution(10_000), { kind: 'SOLIDARITY', amount: 1_000 }],
      100,
    );
    expect(parts.map((p) => p.feeShare)).toEqual([91, 9]);
  });

  it('gives the tied franc to the contribution, then shortfall, solidarity, debt (E4)', () => {
    // Input order is deliberately not the tie order.
    const parts = splitCollectionFee(
      [
        { kind: 'DEBT', amount: 1_000 },
        { kind: 'SOLIDARITY', amount: 1_000 },
        contribution(10_000),
      ],
      100,
    );
    expect(parts.map((p) => [p.kind, p.feeShare])).toEqual([
      ['DEBT', 8],
      ['SOLIDARITY', 8],
      ['CONTRIBUTION', 84],
    ]);
  });

  it('puts shortfall before solidarity and debt when fractions tie', () => {
    const parts = splitCollectionFee(
      [
        { kind: 'DEBT', amount: 1 },
        { kind: 'SOLIDARITY', amount: 1 },
        { kind: 'SHORTFALL', amount: 1, creditorMembershipId: 'M6' },
      ],
      1,
    );
    expect(parts.map((p) => p.feeShare)).toEqual([0, 0, 1]);
  });

  it('orders two contributions by rotation order when they tie', () => {
    const parts = splitCollectionFee(
      [contribution(1_000, 'M9', 9), contribution(1_000, 'M3', 3)],
      1,
    );
    expect(parts.map((p) => p.feeShare)).toEqual([0, 1]);
  });

  it('returns zero shares when the provider charged nothing', () => {
    expect(splitCollectionFee([contribution(10_000)], 0).map((p) => p.feeShare)).toEqual([0]);
  });

  it('refuses a fee above the total, empty payments and parts that are not whole francs', () => {
    expect(() => splitCollectionFee([contribution(50)], 51)).toThrow(RangeError);
    expect(() => splitCollectionFee([], 0)).toThrow(RangeError);
    expect(() => splitCollectionFee([contribution(0)], 0)).toThrow(RangeError);
    expect(() => splitCollectionFee([contribution(10.5)], 0)).toThrow(RangeError);
    expect(() => splitCollectionFee([{ kind: 'CONTRIBUTION', amount: 100 }], 0)).toThrow(
      RangeError,
    ); // a contribution needs its beneficiary (or round pot)
  });

  it('never gives a part a share above its amount and always sums to the fee (property)', () => {
    const kinds = ['CONTRIBUTION', 'SHORTFALL', 'SOLIDARITY', 'DEBT'] as const;
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            kind: fc.constantFrom(...kinds),
            amount: fc.integer({ min: 1, max: 1_000_000 }),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        fc.integer({ min: 0, max: 1_000 }),
        (raw, feeSeed) => {
          const parts: PaymentPart[] = raw.map((p, i) => ({ ...p, creditorMembershipId: `m${i}` }));
          const total = parts.reduce((s, p) => s + p.amount, 0);
          const fee = feeSeed % (total + 1);
          const shares = splitCollectionFee(parts, fee);
          expect(shares.reduce((s, p) => s + p.feeShare, 0)).toBe(fee);
          shares.forEach((p) => expect(p.feeShare).toBeLessThanOrEqual(p.amount));
        },
      ),
    );
  });
});
