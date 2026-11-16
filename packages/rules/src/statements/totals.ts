// Statement totals (spec 2.14): whole francs per category, added in one place so a statement, its
// PDF and its verification code always agree.

import { sumFcfa } from '../money';
import { STATEMENT_CATEGORIES, type StatementLine, type StatementTotals } from './types';

/** 2.14: the total of each category (a reversal line subtracts), and the two informational sums. */
export function statementTotals(lines: readonly StatementLine[]): StatementTotals {
  const totals: StatementTotals = {
    contributions: 0,
    solidarityContributions: 0,
    payouts: 0,
    withdrawals: 0,
    loans: 0,
    repayments: 0,
    fines: 0,
    bids: 0,
    fees: 0,
    supportReceived: 0,
    payoutFeeShares: 0,
    loanInterest: 0,
  };
  for (const category of STATEMENT_CATEGORIES) {
    totals[category] = sumFcfa(lines.filter((l) => l.category === category).map((l) => l.amount));
  }
  totals.payoutFeeShares = sumFcfa(
    lines.filter((l) => l.category === 'payouts').map((l) => l.feeShare),
  );
  totals.loanInterest = sumFcfa(lines.filter((l) => l.category === 'loans').map((l) => l.interest));
  return totals;
}
