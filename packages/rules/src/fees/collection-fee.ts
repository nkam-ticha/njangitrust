// Collection fee split across the parts of one payment (R4.1, R4.2, 3.3).

import { assertNonNegativeFcfa, largestRemainderSplit, type Fcfa } from '../money';

/**
 * R4.2: the parts a payment can hold. Who bears each part's fee share:
 * CONTRIBUTION → the round's beneficiary, SHORTFALL → the leaver receiving it,
 * SOLIDARITY → the solidarity fund, DEBT (fines, loan installments, bids) → the general fund, except
 * a correction debt (D22.2), whose payer adds the fee to the debt (`feeCharged`).
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
  /**
   * CONTRIBUTION: the round whose contribution this is. The beneficiary (or the round pot) is
   * resolved from it when the payment is posted, not when it is requested (R3.4, resolvePaymentParts).
   */
  roundId?: string | null;
  /** CONTRIBUTION once resolved: the round's beneficiary. SHORTFALL: the leaver. */
  creditorMembershipId?: string | null;
  /**
   * CONTRIBUTION in bidding mode while the round has no beneficiary yet: the round whose pot holds
   * the money until POT_ASSIGNED (D10).
   */
  potRoundId?: string | null;
  /** Rotation position of the creditor, for ties between parts of the same kind (3.3). */
  tieOrder?: number;
  /** The caller's reference, usually the obligation ID. */
  ref?: string;
  /**
   * D22.2: DEBT part of a correction debt repaid by request: the fee the payer adds on top of the
   * debt (included in `amount`), so the receivable is cleared by `amount − feeCharged` and the
   * general fund bears only `feeShare − feeCharged` (0 when the fee was as estimated).
   */
  feeCharged?: Fcfa;
}

export type PaymentPartWithFee = PaymentPart & { feeShare: Fcfa };

function assertPart(part: PaymentPart): void {
  assertNonNegativeFcfa(part.amount, 'part amount');
  if (part.amount === 0) throw new RangeError('a payment part must be above zero');
  if (part.kind === 'CONTRIBUTION') {
    if (part.creditorMembershipId && part.potRoundId) {
      throw new RangeError('a contribution part cannot go to both a payable and a pot');
    }
    if (!part.creditorMembershipId && !part.potRoundId) {
      throw new RangeError('resolve the contribution part to its beneficiary or round pot first');
    }
  }
  if (part.kind === 'SHORTFALL' && !part.creditorMembershipId) {
    throw new RangeError('a shortfall part needs the leaver');
  }
  if (part.feeCharged !== undefined) {
    assertNonNegativeFcfa(part.feeCharged, 'feeCharged');
    if (part.kind !== 'DEBT')
      throw new RangeError('only a debt part carries a fee charged (D22.2)');
    if (part.feeCharged >= part.amount) throw new RangeError('feeCharged must be below the part');
  }
}

/**
 * R4.2, 3.3: fee shares of parts given only by kind, amount and tie order, by largest remainder with
 * ties in the order contribution, shortfall, solidarity, debt, then rotation order (then input
 * order). Shares come back in input order. Used to post payments and to verify them.
 */
export function collectionFeeShares(
  parts: readonly { kind: PaymentPartKind; amount: Fcfa; tieOrder?: number }[],
  fee: Fcfa,
): Fcfa[] {
  if (parts.length === 0) throw new RangeError('a payment needs at least one part');
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
  const result = new Array<Fcfa>(parts.length);
  order.forEach((o, k) => {
    result[o.index] = shares[k]!;
  });
  return result;
}

/**
 * R4.2: splits a payment's collection fee across its resolved parts in proportion to their amounts
 * (see collectionFeeShares). Returns the parts in their input order, each with its fee share.
 */
export function splitCollectionFee(parts: readonly PaymentPart[], fee: Fcfa): PaymentPartWithFee[] {
  if (parts.length === 0) throw new RangeError('a payment needs at least one part');
  parts.forEach(assertPart);
  const shares = collectionFeeShares(parts, fee);
  return parts.map((part, i) => ({ ...part, feeShare: shares[i]! }));
}
