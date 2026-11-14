// Resolving payment parts when the payment is posted (R3.4, D10, 3.3).

import type { PaymentPart } from '../fees';

/**
 * R3.4, D10: contribution money for round r goes to round r's beneficiary, decided when the payment
 * is posted (PAYMENT_RECEIVED), not when it was requested: the beneficiary's payable if the round
 * has one, else the round pot (bidding round before its POT_ASSIGNED). Tie order (3.3) is the
 * creditor's rotation position; pot contributions keep tie order 0 (then input order).
 */
export function resolvePaymentParts(
  parts: readonly PaymentPart[],
  ctx: {
    /** The round's beneficiary now, or null while a bidding round has none. */
    beneficiaryOfRound: (roundId: string) => string | null;
    /** The member's position in the rotation (1-based), leavers included. */
    rotationPosition: (membershipId: string) => number;
  },
): PaymentPart[] {
  return parts.map((part) => {
    if (part.kind === 'CONTRIBUTION') {
      if (!part.roundId) throw new RangeError('a contribution part needs its round');
      const beneficiary = ctx.beneficiaryOfRound(part.roundId);
      return beneficiary
        ? {
            ...part,
            creditorMembershipId: beneficiary,
            potRoundId: null,
            tieOrder: ctx.rotationPosition(beneficiary),
          }
        : { ...part, creditorMembershipId: null, potRoundId: part.roundId, tieOrder: 0 };
    }
    if (part.kind === 'SHORTFALL' && part.creditorMembershipId) {
      return { ...part, tieOrder: ctx.rotationPosition(part.creditorMembershipId) };
    }
    return part;
  });
}
