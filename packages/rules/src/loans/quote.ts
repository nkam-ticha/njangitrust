// Loan quote and installment schedule (R7.3).

import { scheduleFee, type FeeSchedule } from '../fees';
import { assertNonNegativeFcfa, floorDiv, roundHalfUpDiv, type Fcfa } from '../money';
import type { Refusal } from '../result';
import type { Frequency } from '../time';
import { installmentDueDates, type InstallmentDue } from './installments';

/**
 * R7.3: interest I = round half up (P × loanRatePermille / 1000 × T); total due = P + I + estimated
 * fee; T installments of floor(total / T), the last one taking the remainder.
 */
export function loanTerms(input: {
  principal: Fcfa;
  months: number;
  loanRatePermille: number;
  feeEstimate: Fcfa;
}): { interest: Fcfa; totalDue: Fcfa; installmentAmounts: Fcfa[] } {
  assertNonNegativeFcfa(input.principal, 'principal');
  assertNonNegativeFcfa(input.feeEstimate, 'feeEstimate');
  if (!Number.isSafeInteger(input.months) || input.months < 1)
    throw new RangeError('months must be 1 or more');
  if (!Number.isSafeInteger(input.loanRatePermille) || input.loanRatePermille < 0) {
    throw new RangeError('loanRatePermille must be a non-negative integer');
  }
  const interest = roundHalfUpDiv(
    BigInt(input.principal) * BigInt(input.loanRatePermille) * BigInt(input.months),
    1000n,
  );
  const totalDue = input.principal + interest + input.feeEstimate;
  const base = floorDiv(totalDue, input.months);
  const installmentAmounts = Array.from({ length: input.months }, (_, i) =>
    i === input.months - 1 ? totalDue - base * (input.months - 1) : base,
  );
  return { interest, totalDue, installmentAmounts };
}

export interface LoanInstallment {
  number: number;
  amount: Fcfa;
  /** D18.2: a round deadline of this cycle, or "due at a round of the next cycle". */
  due: InstallmentDue;
}

/**
 * R7.2, R7.3, D16.3, D18.2: checks a loan request and returns its full quote, its installment dates
 * computed from the approval (or quote) time and the current cycle's rounds (installmentDueDates).
 */
export function loanQuote(input: {
  principal: Fcfa;
  months: number;
  loanRatePermille: number;
  loanMaxMonths: number;
  feeSchedule: FeeSchedule;
  /** From loanLimit (R7.2). */
  limit: Fcfa;
  /** When the loan is approved (or quoted). */
  approvedAt: Date;
  frequency: Frequency;
  /** The current cycle's round dates (roundDates), the round in progress included. */
  rounds: readonly { dueAt: Date; payoutAt: Date }[];
}):
  | {
      ok: true;
      principal: Fcfa;
      months: number;
      interest: Fcfa;
      feeEstimate: Fcfa;
      totalDue: Fcfa;
      installments: LoanInstallment[];
    }
  | Refusal<'INVALID_AMOUNT'>
  | Refusal<'LOAN_MONTHS_OUT_OF_RANGE', { min: number; max: number }>
  | Refusal<'LOAN_ABOVE_LIMIT', { limit: Fcfa }> {
  if (!Number.isSafeInteger(input.principal) || input.principal <= 0)
    return { ok: false, code: 'INVALID_AMOUNT' };
  if (
    !Number.isSafeInteger(input.months) ||
    input.months < 1 ||
    input.months > input.loanMaxMonths
  ) {
    return { ok: false, code: 'LOAN_MONTHS_OUT_OF_RANGE', min: 1, max: input.loanMaxMonths };
  }
  if (input.principal > input.limit)
    return { ok: false, code: 'LOAN_ABOVE_LIMIT', limit: input.limit };
  const dueAts = installmentDueDates({
    approvedAt: input.approvedAt,
    months: input.months,
    frequency: input.frequency,
    rounds: input.rounds,
  });
  const feeEstimate = scheduleFee(input.feeSchedule, 'DISBURSEMENT', input.principal);
  const terms = loanTerms({
    principal: input.principal,
    months: input.months,
    loanRatePermille: input.loanRatePermille,
    feeEstimate,
  });
  return {
    ok: true,
    principal: input.principal,
    months: input.months,
    interest: terms.interest,
    feeEstimate,
    totalDue: terms.totalDue,
    installments: terms.installmentAmounts.map((amount, i) => ({
      number: i + 1,
      amount,
      due: dueAts[i]!,
    })),
  };
}
