// Derived values (2.5): what a member can withdraw and what the group can lend.

import { assertNonNegativeFcfa, type Fcfa } from '../money';
import { assertDate } from '../time';
import type { BalanceSummary } from './balances';

/**
 * 2.5, R5.6: available for loans = cash − all payables − pots − solidarity fund − in-flight
 * disbursements, floored at zero, so money reserved for members or the solidarity fund is never lent.
 */
export function availableForLoans(input: {
  summary: Pick<BalanceSummary, 'cash' | 'payables' | 'pots' | 'solidarityFund'>;
  inFlightDisbursements: Fcfa;
}): Fcfa {
  assertNonNegativeFcfa(input.inFlightDisbursements, 'inFlightDisbursements');
  const { cash, payables, pots, solidarityFund } = input.summary;
  return Math.max(0, cash - payables - pots - solidarityFund - input.inFlightDisbursements);
}

/** R5.2: a payout credit to a member, locked until its round's payout time. */
export interface PayoutCredit {
  amount: Fcfa;
  payoutAt: Date;
}

/**
 * 2.5, R5.2, R5.4: available to withdraw = payable − credits still locked (round payout time not
 * reached; never more than the payable holds) − estimated withdrawal fee, floored at zero.
 */
export function availableToWithdraw(input: {
  payableBalance: Fcfa;
  credits: readonly PayoutCredit[];
  now: Date;
  feeEstimate: Fcfa;
}): { available: Fcfa; locked: Fcfa } {
  assertNonNegativeFcfa(input.payableBalance, 'payableBalance');
  assertNonNegativeFcfa(input.feeEstimate, 'feeEstimate');
  const now = assertDate(input.now, 'now');
  let pending = 0;
  for (const credit of input.credits) {
    assertNonNegativeFcfa(credit.amount, 'credit');
    if (assertDate(credit.payoutAt, 'payoutAt') > now) pending += credit.amount;
  }
  const locked = Math.min(pending, input.payableBalance);
  return {
    available: Math.max(0, input.payableBalance - locked - input.feeEstimate),
    locked,
  };
}
