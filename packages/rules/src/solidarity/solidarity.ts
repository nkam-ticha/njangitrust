// Solidarity fund requests (R10.2, R10.3). Payouts pass by a SOLIDARITY_PAYOUT vote (R11.1); the fund
// is never distributed at cycle end (R10.5).

import { scheduleFee, type FeeSchedule } from '../fees';
import { assertNonNegativeFcfa, type Fcfa } from '../money';
import { MIN_WITHDRAWAL } from '../payouts';
import type { Refusal } from '../result';

/** R10.2: the life events a request can be for. */
export const SOLIDARITY_EVENTS = ['DEUIL', 'NAISSANCE', 'MALADIE', 'MARIAGE', 'AUTRE'] as const;
export type SolidarityEvent = (typeof SOLIDARITY_EVENTS)[number];

/**
 * R10.2, R10.3, R4.3: a request for the requester or another member, for a listed event, of at most
 * the fund's balance (less payouts already passed and not yet completed). The recipient bears the
 * disbursement fee, receiving the amount minus the estimated fee, at least 100 FCFA like a withdrawal.
 */
export function validateSolidarityRequest(input: {
  amount: Fcfa;
  event: SolidarityEvent;
  solidarityFundBalance: Fcfa;
  /** Passed SOLIDARITY_PAYOUT amounts not yet disbursed. */
  pendingSolidarityPayouts: Fcfa;
  feeSchedule: FeeSchedule;
  recipientIsMember: boolean;
}):
  | { ok: true; amount: Fcfa; feeEstimate: Fcfa; recipientReceives: Fcfa }
  | Refusal<'UNKNOWN_EVENT' | 'RECIPIENT_NOT_MEMBER' | 'INVALID_AMOUNT'>
  | Refusal<'ABOVE_SOLIDARITY_FUND', { balance: Fcfa }>
  | Refusal<'BELOW_MINIMUM_PAYOUT', { minimumReceived: Fcfa; feeEstimate: Fcfa }> {
  if (!SOLIDARITY_EVENTS.includes(input.event)) return { ok: false, code: 'UNKNOWN_EVENT' };
  if (!input.recipientIsMember) return { ok: false, code: 'RECIPIENT_NOT_MEMBER' };
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
    return { ok: false, code: 'INVALID_AMOUNT' };
  assertNonNegativeFcfa(input.solidarityFundBalance, 'solidarityFundBalance');
  assertNonNegativeFcfa(input.pendingSolidarityPayouts, 'pendingSolidarityPayouts');
  const balance = Math.max(0, input.solidarityFundBalance - input.pendingSolidarityPayouts);
  if (input.amount > balance) return { ok: false, code: 'ABOVE_SOLIDARITY_FUND', balance };
  const feeEstimate = scheduleFee(input.feeSchedule, 'DISBURSEMENT', input.amount);
  const recipientReceives = input.amount - feeEstimate;
  if (recipientReceives < MIN_WITHDRAWAL) {
    return {
      ok: false,
      code: 'BELOW_MINIMUM_PAYOUT',
      minimumReceived: MIN_WITHDRAWAL,
      feeEstimate,
    };
  }
  return { ok: true, amount: input.amount, feeEstimate, recipientReceives };
}
