// Leaving mid-cycle (EARLY_EXIT) or removal (MEMBER_REMOVE): the settlement of R12.3 and D13.4.

import { assertNonNegativeFcfa, splitEqually, type Fcfa } from '../money';
import { autoSettlement, type SettleableDebt } from '../payouts';
import { assertDate } from '../time';

/** What both kinds of exit settle: the leaver's debts, the loan balance included (D13.4). */
type Settled = {
  /** D13.4: installments not yet due that became due at the exit. */
  acceleratedInstallmentIds: string[];
  /** The leaver's due debts taken from the payable (AUTO_SETTLEMENT). */
  settlement: ReturnType<typeof autoSettlement>;
  payableAfter: Fcfa;
};

export type ExitSettlement =
  | ({ kind: 'SERVED'; contributionsStayOwed: true } & Settled)
  | ({
      kind: 'NOT_SERVED';
      /** R: the contributions the leaver paid this cycle. */
      refund: Fcfa;
      /** F = min(R, available for loans), paid by LEAVER_REFUND. */
      fromFund: Fcfa;
      /** R − F, owed by the remaining members as SHORTFALL_SHARE obligations. */
      shortfall: Fcfa;
      shortfallShares: { membershipId: string; amount: Fcfa; dueAt: Date }[];
    } & Settled);

/**
 * R12.3, D13.4: a member who was already served keeps owing their remaining contributions to those
 * rounds' beneficiaries. A member not yet served loses their round and future obligations and is
 * refunded the contributions R they paid this cycle: the general fund pays F = min(R, available for
 * loans); the shortfall R − F is split equally among the remaining active members (largest
 * remainder, in rotation order), due at the next round's dueAt. In both cases the leaver's whole
 * remaining loan balance becomes due at the exit (D13.4) and auto-settlement takes their due debts
 * from the payable (refund included) before any withdrawal; what doesn't fit stays owed (D13.3).
 */
export function exitSettlement(input: {
  served: boolean;
  contributionsPaidThisCycle: Fcfa;
  availableForLoans: Fcfa;
  leaverPayableBalance: Fcfa;
  /** Due debts (fines, bids, installments already due). */
  leaverDebts: readonly SettleableDebt[];
  /**
   * Every unpaid installment of the leaver's loan, due or not; `dueAt` null for one still "due at a
   * round of the next cycle" (D18.2). L2: `loanInFlight` while the loan's send is unconfirmed: the
   * installments are accelerated but not settled until it completes (cancelled if it is returned).
   */
  leaverLoanInstallments: readonly {
    id: string;
    amount: Fcfa;
    dueAt: Date | null;
    loanInFlight?: boolean;
  }[];
  /** The remaining active members, in rotation order. */
  remainingMembershipIds: readonly string[];
  nextRoundDueAt: Date;
  now: Date;
}): ExitSettlement {
  assertNonNegativeFcfa(input.contributionsPaidThisCycle, 'contributionsPaidThisCycle');
  assertNonNegativeFcfa(input.availableForLoans, 'availableForLoans');
  assertNonNegativeFcfa(input.leaverPayableBalance, 'leaverPayableBalance');
  const now = assertDate(input.now, 'now');
  const known = new Set(input.leaverDebts.map((d) => d.id));
  const notYetDue = (i: { dueAt: Date | null }) => i.dueAt === null || i.dueAt.getTime() > now;
  const accelerated = input.leaverLoanInstallments.filter(notYetDue);
  const debts: SettleableDebt[] = [
    ...input.leaverDebts,
    ...input.leaverLoanInstallments
      .filter((i) => !known.has(i.id))
      .map((i) => ({
        id: i.id,
        kind: 'LOAN_INSTALLMENT' as const,
        amount: i.amount,
        dueAt: notYetDue(i) ? input.now : i.dueAt!,
        ...(i.loanInFlight === true ? { loanInFlight: true } : {}),
      })),
  ];
  const settle = (payable: Fcfa): Settled => {
    const settlement = autoSettlement({ payableBalance: payable, debts, now: input.now });
    return {
      acceleratedInstallmentIds: accelerated.map((i) => i.id),
      settlement,
      payableAfter: settlement.remainingPayable,
    };
  };
  if (input.served) {
    return { kind: 'SERVED', contributionsStayOwed: true, ...settle(input.leaverPayableBalance) };
  }
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
  return {
    kind: 'NOT_SERVED',
    refund,
    fromFund,
    shortfall,
    shortfallShares,
    ...settle(input.leaverPayableBalance + fromFund),
  };
}
