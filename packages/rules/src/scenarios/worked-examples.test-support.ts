// Shared fixtures of the worked examples (spec 3.17). Not part of the public API.

import { paymentReceivedPostings, roundDates, type PaymentPart } from '../index';
import { entry, paidOut } from '../ledger/ledger.test-support';

export const MEMBERS = Array.from({ length: 10 }, (_, i) => `M${i + 1}`);
// Monthly rounds on the last Saturday at 18:00 in Douala; round 4 pays out on 27 February 2027.
export const schedule = {
  firstPayoutAt: new Date('2026-11-28T17:00:00.000Z'),
  frequency: 'MONTHLY',
  monthlyAnchor: { kind: 'LAST_WEEKDAY', weekday: 6 },
} as const;
export const round4 = roundDates(schedule, 4);
export const round5 = roundDates(schedule, 5);

export const round4Parts = (beneficiary = 'M7'): PaymentPart[] => [
  { kind: 'CONTRIBUTION', amount: 10_000, creditorMembershipId: beneficiary },
  { kind: 'SOLIDARITY', amount: 1_000 },
];
export const payRound4 = (payer: string) =>
  entry(
    'PAYMENT_RECEIVED',
    paymentReceivedPostings({
      payerMembershipId: payer,
      fee: 100,
      feeSource: 'SCHEDULE',
      parts: round4Parts(),
    }),
  );
/** E3's loan to M7 (D18.1): sent (P + fee in flight), then completed at the 500 estimate. */
export const e3Loan = () => paidOut('LOAN', 'M7', 30_000, { interest: 3_000, id: 'e3-loan' });
