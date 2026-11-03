// Obligations of a round (R3.1) and the on-time rule (R3.5).

import { assertNonNegativeFcfa, type Fcfa } from '../money';
import { assertDate } from '../time';

/** Spec 2.4 Obligation.kind. */
export type ObligationKind =
  'CONTRIBUTION' | 'SOLIDARITY' | 'FINE' | 'LOAN_INSTALLMENT' | 'BID' | 'SHORTFALL_SHARE';

/** Spec 2.4 Obligation.status. */
export type ObligationStatus = 'DUE' | 'PAID' | 'SETTLED' | 'CANCELLED';

/** An obligation to create, before it has an ID. */
export interface ObligationDraft {
  kind: ObligationKind;
  membershipId: string;
  amount: Fcfa;
  dueAt: Date;
  roundId: string | null;
  /** CONTRIBUTION: the round's beneficiary (null until a bid closes). SHORTFALL_SHARE: the leaver. */
  creditorMembershipId: string | null;
}

/**
 * R3.1: when a round opens, every active member, the beneficiary included, owes the contribution
 * and, if the solidarity fund is on (above 0), the solidarity contribution.
 */
export function roundObligations(input: {
  contributionAmount: Fcfa;
  solidarityContribution: Fcfa;
  round: { id: string; dueAt: Date; beneficiaryMembershipId: string | null };
  activeMembershipIds: readonly string[];
}): ObligationDraft[] {
  assertNonNegativeFcfa(input.contributionAmount, 'contributionAmount');
  assertNonNegativeFcfa(input.solidarityContribution, 'solidarityContribution');
  if (input.contributionAmount === 0) throw new RangeError('contributionAmount must be above zero');
  assertDate(input.round.dueAt, 'dueAt');
  if (new Set(input.activeMembershipIds).size !== input.activeMembershipIds.length) {
    throw new RangeError('each member owes one contribution per round');
  }
  const out: ObligationDraft[] = [];
  for (const membershipId of input.activeMembershipIds) {
    out.push({
      kind: 'CONTRIBUTION',
      membershipId,
      amount: input.contributionAmount,
      dueAt: input.round.dueAt,
      roundId: input.round.id,
      creditorMembershipId: input.round.beneficiaryMembershipId,
    });
    if (input.solidarityContribution > 0) {
      out.push({
        kind: 'SOLIDARITY',
        membershipId,
        amount: input.solidarityContribution,
        dueAt: input.round.dueAt,
        roundId: input.round.id,
        creditorMembershipId: null,
      });
    }
  }
  return out;
}

/**
 * R3.5: a payment is on time if its PaymentIntent was created before dueAt and later succeeded,
 * even when the operator confirms it after dueAt.
 */
export function isOnTime(input: {
  intentCreatedAt: Date;
  dueAt: Date;
  succeeded: boolean;
}): boolean {
  return (
    input.succeeded &&
    assertDate(input.intentCreatedAt, 'intentCreatedAt') < assertDate(input.dueAt, 'dueAt')
  );
}
