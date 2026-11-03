// Loan quote and installment schedule (R7.3).

import { scheduleFee, type FeeSchedule } from '../fees';
import { assertNonNegativeFcfa, floorDiv, roundHalfUpDiv, type Fcfa } from '../money';
import type { Refusal } from '../result';

/** Smallest principal, the same floor as a withdrawal (R5.4), so every disbursement is meaningful. */
export const MIN_LOAN_PRINCIPAL = 100;

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
  dueAt: Date;
}

/**
 * R7.2, R7.3: checks a loan request and returns its full quote. `installmentDueAts` are the dueAt of
 * the next rounds after the current one (at least `months` of them, from roundDates).
 */
export function loanQuote(input: {
  principal: Fcfa;
  months: number;
  loanRatePermille: number;
  loanMaxMonths: number;
  feeSchedule: FeeSchedule;
  /** From loanLimit (R7.2). */
  limit: Fcfa;
  installmentDueAts: readonly Date[];
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
  | Refusal<'LOAN_BELOW_MINIMUM', { minimum: Fcfa }>
  | Refusal<'LOAN_MONTHS_OUT_OF_RANGE', { min: number; max: number }>
  | Refusal<'LOAN_ABOVE_LIMIT', { limit: Fcfa }> {
  if (!Number.isSafeInteger(input.principal) || input.principal <= 0)
    return { ok: false, code: 'INVALID_AMOUNT' };
  if (input.principal < MIN_LOAN_PRINCIPAL) {
    return { ok: false, code: 'LOAN_BELOW_MINIMUM', minimum: MIN_LOAN_PRINCIPAL };
  }
  if (
    !Number.isSafeInteger(input.months) ||
    input.months < 1 ||
    input.months > input.loanMaxMonths
  ) {
    return { ok: false, code: 'LOAN_MONTHS_OUT_OF_RANGE', min: 1, max: input.loanMaxMonths };
  }
  if (input.principal > input.limit)
    return { ok: false, code: 'LOAN_ABOVE_LIMIT', limit: input.limit };
  if (input.installmentDueAts.length < input.months) {
    throw new RangeError('one due date is needed per installment');
  }
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
      dueAt: input.installmentDueAts[i]!,
    })),
  };
}
