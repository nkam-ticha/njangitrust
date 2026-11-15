// Collections and disbursements at the provider (spec 2.6 rules 3 and 4, PAY-05, CLAUDE.md rule 8):
// when their status is checked, what each answer means, and when a retry is allowed. Pure: the
// service passes `now`.

import type { Refusal } from '../result';
import { assertDate } from '../time';

/** Spec 2.4 PaymentIntent.status (a Disbursement uses the same states). */
export type OperationStatus = 'CREATED' | 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'EXPIRED';
/** Spec 2.6: what the provider reports. */
export type ProviderStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED';

/** Spec 2.6 rule 4: polling lasts 10 minutes, then hourly checks for 24 hours. */
export const POLLING_SECONDS = 600;
export const LATE_CHECK_HOURS = 24;

const SECOND = 1000;
const HOUR = 3_600 * SECOND;

/**
 * Spec 2.6 rule 4: every status check of an operation started at `startedAt`: after 5 s, 10 s and
 * 20 s more, then every 30 s up to 10 minutes, the final check at 10 minutes, then every hour up
 * to 24 hours.
 */
export function statusCheckTimes(startedAt: Date): Date[] {
  const start = assertDate(startedAt, 'startedAt');
  const offsets: number[] = [5, 15, 35];
  for (let s = 65; s < POLLING_SECONDS; s += 30) offsets.push(s);
  offsets.push(POLLING_SECONDS);
  const out = offsets.map((s) => new Date(start + s * SECOND));
  for (let h = 1; h <= LATE_CHECK_HOURS; h++) out.push(new Date(start + h * HOUR));
  return out;
}

/** Spec 2.6 rule 4: the next status check strictly after `now`, or null once 24 hours have passed. */
export function nextStatusCheck(startedAt: Date, now: Date): Date | null {
  const at = assertDate(now, 'now');
  return statusCheckTimes(startedAt).find((t) => t.getTime() > at) ?? null;
}

const FINAL: readonly OperationStatus[] = ['SUCCESSFUL', 'FAILED'];

/**
 * Spec 2.6 rules 3 and 4: the operation's new status after the provider reported `reported` at
 * `now`, and what to record. A success or failure is recorded once (`record`); a duplicate answer
 * (callback or poll) records nothing. A final status the provider later contradicts is never
 * recorded twice: `conflict` asks for the reversal flow (REVERSAL for a payment, DISBURSEMENT_REFUNDED
 * for a payout, both through their own rules). Still pending at 10 minutes: EXPIRED, checked hourly
 * for 24 hours (a late success is still recorded); after that, no more checks (`nextCheckAt` null:
 * an administrator follows it up with the provider).
 */
export function applyProviderStatus(input: {
  current: OperationStatus;
  reported: ProviderStatus;
  startedAt: Date;
  now: Date;
}): {
  status: OperationStatus;
  record: 'NONE' | 'SUCCESS' | 'FAILURE';
  nextCheckAt: Date | null;
  conflict: boolean;
} {
  const start = assertDate(input.startedAt, 'startedAt');
  const now = assertDate(input.now, 'now');
  if (FINAL.includes(input.current)) {
    const conflict = input.reported !== 'PENDING' && input.reported !== input.current;
    return { status: input.current, record: 'NONE', nextCheckAt: null, conflict };
  }
  if (input.reported === 'SUCCESSFUL')
    return { status: 'SUCCESSFUL', record: 'SUCCESS', nextCheckAt: null, conflict: false };
  if (input.reported === 'FAILED')
    return { status: 'FAILED', record: 'FAILURE', nextCheckAt: null, conflict: false };
  const expired = input.current === 'EXPIRED' || now >= start + POLLING_SECONDS * SECOND;
  return {
    status: expired ? 'EXPIRED' : 'PENDING',
    record: 'NONE',
    nextCheckAt: nextStatusCheck(input.startedAt, input.now),
    conflict: false,
  };
}

/**
 * Spec 2.6 rule 3, PAY-05, CLAUDE.md rule 8: a new collection or disbursement for the same items
 * may start only after the status was checked again just now and the provider said FAILED. A retry
 * always uses a new operation ID (the old one stays as it is).
 */
export function retryDecision(input: {
  status: OperationStatus;
  /** True when `status` comes from a getPaymentStatus / getDisbursementStatus call made just now. */
  checkedJustNow: boolean;
}): { ok: true } | Refusal<'CHECK_STATUS_FIRST' | 'OPERATION_STILL_PENDING' | 'ALREADY_SUCCEEDED'> {
  if (!input.checkedJustNow) return { ok: false, code: 'CHECK_STATUS_FIRST' };
  if (input.status === 'SUCCESSFUL') return { ok: false, code: 'ALREADY_SUCCEEDED' };
  if (input.status !== 'FAILED') return { ok: false, code: 'OPERATION_STILL_PENDING' };
  return { ok: true };
}
