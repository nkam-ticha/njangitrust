// Collection fee split across the parts of one payment (R4.1, R4.2, 3.3).

import { assertNonNegativeFcfa, largestRemainderSplit, type Fcfa } from '../money';

/**
 * R4.2: the parts a payment can hold. Who bears each part's fee share:
 * CONTRIBUTION → the round's beneficiary, SHORTFALL → the leaver receiving it,
 * SOLIDARITY → the solidarity fund, DEBT (fines, loan installments, bids) → the general fund.
 */
export type PaymentPartKind = 'CONTRIBUTION' | 'SHORTFALL' | 'SOLIDARITY' | 'DEBT';

/** 3.3: the fixed tie order of fee shares. */
export const PAYMENT_PART_TIE_ORDER: readonly PaymentPartKind[] = [
  'CONTRIBUTION',
  'SHORTFALL',
  'SOLIDARITY',
  'DEBT',
];

export interface PaymentPart {
  kind: PaymentPartKind;
  amount: Fcfa;
  /** CONTRIBUTION: the round's beneficiary. SHORTFALL: the leaver. */
  creditorMembershipId?: string | null;
  /**
   * CONTRIBUTION in bidding mode before the bid closes: the round whose pot holds the money until
   * the beneficiary is known (see POT_ASSIGNED in the ledger).
   */
  potRoundId?: string | null;
  /** Position of the creditor in the rotation, for ties between parts of the same kind (3.3). */
  tieOrder?: number;
  /** The caller's reference, usually the obligation ID. */
  ref?: string;
}

export type PaymentPartWithFee = PaymentPart & { feeShare: Fcfa };

function assertPart(part: PaymentPart): void {
  assertNonNegativeFcfa(part.amount, 'part amount');
  if (part.amount === 0) throw new RangeError('a payment part must be above zero');
  if (part.kind === 'CONTRIBUTION' && !part.creditorMembershipId && !part.potRoundId) {
    throw new RangeError('a contribution part needs its beneficiary or its round pot');
  }
  if (part.kind === 'SHORTFALL' && !part.creditorMembershipId) {
    throw new RangeError('a shortfall part needs the leaver');
  }
}

/**
 * R4.2: splits a payment's collection fee across its parts in proportion to their amounts, by
 * largest remainder with ties in the order contribution, shortfall, solidarity, debt, then rotation
 * order. Returns the parts in their input order, each with its fee share.
 */
export function splitCollectionFee(parts: readonly PaymentPart[], fee: Fcfa): PaymentPartWithFee[] {
  if (parts.length === 0) throw new RangeError('a payment needs at least one part');
  parts.forEach(assertPart);
  assertNonNegativeFcfa(fee, 'fee');
  const total = parts.reduce((sum, p) => sum + p.amount, 0);
  if (fee > total) throw new RangeError('the fee cannot exceed the payment');
  const order = parts
    .map((part, index) => ({ part, index }))
    .sort((a, b) => {
      const byKind =
        PAYMENT_PART_TIE_ORDER.indexOf(a.part.kind) - PAYMENT_PART_TIE_ORDER.indexOf(b.part.kind);
      if (byKind !== 0) return byKind;
      const byRotation = (a.part.tieOrder ?? 0) - (b.part.tieOrder ?? 0);
      return byRotation !== 0 ? byRotation : a.index - b.index;
    });
  const shares = largestRemainderSplit(
    fee,
    order.map((o) => o.part.amount),
  );
  const result: PaymentPartWithFee[] = new Array<PaymentPartWithFee>(parts.length);
  order.forEach((o, k) => {
    result[o.index] = { ...o.part, feeShare: shares[k]! };
  });
  return result;
}
