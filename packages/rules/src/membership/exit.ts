// Leaving mid-cycle (EARLY_EXIT) or removal (MEMBER_REMOVE): the settlement of R12.3.

import { assertNonNegativeFcfa, splitEqually, type Fcfa } from '../money';
import { autoSettlement, type SettleableDebt } from '../payouts';

export type ExitSettlement =
  | { kind: 'SERVED'; contributionsStayOwed: true }
  | {
      kind: 'NOT_SERVED';
      /** R: the contributions the leaver paid this cycle. */
      refund: Fcfa;
      /** F = min(R, available for loans), paid by LEAVER_REFUND. */
      fromFund: Fcfa;
      /** R − F, owed by the remaining members as SHORTFALL_SHARE obligations. */
      shortfall: Fcfa;
      shortfallShares: { membershipId: string; amount: Fcfa; dueAt: Date }[];
      /** Step 3: the leaver's debts taken from the payable after the refund (AUTO_SETTLEMENT). */
      settlement: ReturnType<typeof autoSettlement>;
      payableAfter: Fcfa;
    };

/**
 * R12.3: a member who was already served keeps owing their remaining contributions to those rounds'
 * beneficiaries. A member not yet served loses their round and future obligations, and is refunded
 * the contributions R they paid this cycle: the general fund pays F = min(R, available for loans);
 * the shortfall R − F is split equally among the remaining active members (largest remainder, in
 * rotation order), due at the next round's dueAt; auto-settlement then takes the leaver's debts.
 */
export function exitSettlement(input: {
  served: boolean;
  contributionsPaidThisCycle: Fcfa;
  availableForLoans: Fcfa;
  leaverPayableBalance: Fcfa;
  leaverDebts: readonly SettleableDebt[];
  /** The remaining active members, in rotation order. */
  remainingMembershipIds: readonly string[];
  nextRoundDueAt: Date;
  now: Date;
}): ExitSettlement {
  if (input.served) return { kind: 'SERVED', contributionsStayOwed: true };
  assertNonNegativeFcfa(input.contributionsPaidThisCycle, 'contributionsPaidThisCycle');
  assertNonNegativeFcfa(input.availableForLoans, 'availableForLoans');
  assertNonNegativeFcfa(input.leaverPayableBalance, 'leaverPayableBalance');
  const refund = input.contributionsPaidThisCycle;
  const fromFund = Math.min(refund, input.availableForLoans);
  const shortfall = refund - fromFund;
  if (shortfall > 0 && input.remainingMembershipIds.length === 0) {
    throw new RangeError('a shortfall needs remaining members to share it');
  }
  const shortfallShares =
    shortfall === 0
      ? []
      : splitEqually(shortfall, input.remainingMembershipIds.length).map((amount, i) => ({
          membershipId: input.remainingMembershipIds[i]!,
          amount,
          dueAt: input.nextRoundDueAt,
        }));
  const settlement = autoSettlement({
    payableBalance: input.leaverPayableBalance + fromFund,
    debts: input.leaverDebts,
    now: input.now,
  });
  return {
    kind: 'NOT_SERVED',
    refund,
    fromFund,
    shortfall,
    shortfallShares,
    settlement,
    payableAfter: settlement.remainingPayable,
  };
}
