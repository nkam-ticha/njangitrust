// Fines (R6.1 late contributions, R6.2 late installments, R6.3 meeting absence). Fines go to the
// general fund (R6.4) through FINE_ASSESSED.

import type { ObligationStatus } from '../contributions';
import { assertNonNegativeFcfa, type Fcfa } from '../money';
import { autoSettlement, type SettleableDebt } from '../payouts';
import { assertDate } from '../time';

/** A member's CONTRIBUTION and SOLIDARITY obligations of one round, as they stand at dueAt. */
export interface RoundStanding {
  membershipId: string;
  obligations: readonly {
    kind: 'CONTRIBUTION' | 'SOLIDARITY';
    status: ObligationStatus;
    /** R3.5: a PaymentIntent created before dueAt is still in progress. */
    onTimeIntentInProgress: boolean;
  }[];
}

/**
 * R6.1: at dueAt, one fine of `lateFine` per member who still has an unpaid CONTRIBUTION or
 * SOLIDARITY obligation for the round with no on-time payment in progress.
 */
export function roundLateFines(input: {
  lateFine: Fcfa;
  members: readonly RoundStanding[];
}): { membershipId: string; amount: Fcfa }[] {
  assertNonNegativeFcfa(input.lateFine, 'lateFine');
  if (input.lateFine === 0) return [];
  return input.members
    .filter((m) => m.obligations.some((o) => o.status === 'DUE' && !o.onTimeIntentInProgress))
    .map((m) => ({ membershipId: m.membershipId, amount: input.lateFine }));
}

/**
 * R6.2: a loan installment unpaid at its dueAt gets one fine, except when the borrower is the
 * round's beneficiary and their locked payout covers it, after the other due debts that
 * auto-settlement takes first (R5.3; include any fine assessed at the same dueAt). It is then
 * settled at payoutAt instead.
 */
export function installmentFine(input: {
  lateFine: Fcfa;
  installment: {
    id: string;
    amount: Fcfa;
    dueAt: Date;
    status: ObligationStatus;
    onTimeIntentInProgress: boolean;
  };
  borrowerIsRoundBeneficiary: boolean;
  /** The borrower's locked payout for this round (their payable credits for it). */
  lockedPayout: Fcfa;
  otherDueDebts: readonly SettleableDebt[];
}):
  | { fined: true; amount: Fcfa }
  | {
      fined: false;
      reason: 'FINES_OFF' | 'PAID' | 'PAYMENT_IN_PROGRESS' | 'COVERED_BY_LOCKED_PAYOUT';
    } {
  assertNonNegativeFcfa(input.lateFine, 'lateFine');
  if (input.installment.status !== 'DUE') return { fined: false, reason: 'PAID' };
  if (input.installment.onTimeIntentInProgress)
    return { fined: false, reason: 'PAYMENT_IN_PROGRESS' };
  if (input.lateFine === 0) return { fined: false, reason: 'FINES_OFF' };
  if (input.borrowerIsRoundBeneficiary) {
    const asDebt: SettleableDebt = {
      id: input.installment.id,
      kind: 'LOAN_INSTALLMENT',
      amount: input.installment.amount,
      dueAt: input.installment.dueAt,
    };
    const { settled } = autoSettlement({
      payableBalance: input.lockedPayout,
      debts: [...input.otherDueDebts, asDebt],
      now: input.installment.dueAt,
    });
    if (settled.some((d) => d.id === asDebt.id && d.kind === 'LOAN_INSTALLMENT')) {
      return { fined: false, reason: 'COVERED_BY_LOCKED_PAYOUT' };
    }
  }
  return { fined: true, amount: input.lateFine };
}

/**
 * R6.3: when `meetingAbsenceFine` is above zero, members marked absent without an excuse sent before
 * the meeting starts get that fine when the meeting closes.
 */
export function absenceFines(input: {
  meetingAbsenceFine: Fcfa;
  startsAt: Date;
  attendance: readonly { membershipId: string; present: boolean; excuseSentAt: Date | null }[];
}): { membershipId: string; amount: Fcfa }[] {
  assertNonNegativeFcfa(input.meetingAbsenceFine, 'meetingAbsenceFine');
  if (input.meetingAbsenceFine === 0) return [];
  const start = assertDate(input.startsAt, 'startsAt');
  return input.attendance
    .filter((a) => !a.present && !(a.excuseSentAt && a.excuseSentAt.getTime() < start))
    .map((a) => ({ membershipId: a.membershipId, amount: input.meetingAbsenceFine }));
}
