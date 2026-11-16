// Test ledgers for the statement rules: the worked examples E1 to E5 of spec 3.17 as a chain of
// real, sealed transactions. Not part of the package's public API.

import { paymentReceivedPostings } from '../ledger/fee-postings';
import { chainOf, completeOf, entry, seedFund, sendOf } from '../ledger/ledger.test-support';
import { autoSettlementPostings, fineAssessedPostings } from '../ledger/postings';
import type { LedgerEntry, LedgerTransaction } from '../ledger/types';
import type { ObligationFact } from './types';

export const MEMBERS = Array.from({ length: 10 }, (_, i) => `M${i + 1}`);
export const BENEFICIARY = 'M7';

/** Instants of the scenario, all in November 2026 (UTC). */
export const T = {
  loan: '2026-11-03T10:00:00.000Z',
  payments: '2026-11-20T10:00:00.000Z',
  fine: '2026-11-21T17:00:00.000Z',
  late: '2026-11-22T09:00:00.000Z',
  payout: '2026-11-27T17:00:00.000Z',
  withdrawal: '2026-11-28T08:00:00.000Z',
} as const;

/** E1: one payment of 10 000 + 1 000 with a 100 FCFA fee, for round 4 (beneficiary M7). */
export function round4Payment(payer: string, when: string): LedgerEntry {
  return entry(
    'PAYMENT_RECEIVED',
    paymentReceivedPostings({
      payerMembershipId: payer,
      fee: 100,
      feeSource: 'SCHEDULE',
      parts: [
        {
          kind: 'CONTRIBUTION',
          amount: 10_000,
          creditorMembershipId: BENEFICIARY,
          tieOrder: 7,
          ref: `ob-c-${payer}`,
        },
        { kind: 'SOLIDARITY', amount: 1_000, ref: `ob-s-${payer}` },
      ],
    }),
    { membershipId: payer, refType: 'PAYMENT_INTENT', refId: `pi-${payer}`, occurredAt: when },
  );
}

export interface Scenario {
  transactions: LedgerTransaction[];
  obligations: ObligationFact[];
  /** Position (seq) of the entries a test refers to. */
  seq: { payments: Record<string, number>; withdrawal: number; fine: number };
}

/**
 * E3 + E5 for M7 in one chain: M7 borrows 30 000 (interest 3 000, fee 500), round 4 is paid by all
 * ten members (M7 late, with a 1 000 fine), at the payout 17 750 is auto-settled (installment 16 750
 * plus the fine 1 000) and M7 withdraws 80 840 with a 500 fee: payable 99 090 − 17 750 − 81 340 = 0.
 */
export function e5Scenario(): Scenario {
  const sent = sendOf('LOAN', BENEFICIARY, 30_000, {
    interest: 3_000,
    feeEstimated: 500,
    feeActual: 500,
  });
  const fine = entry('FINE_ASSESSED', fineAssessedPostings({ membershipId: 'M7', amount: 1_000 }), {
    membershipId: 'M7',
    occurredAt: T.fine,
  });
  const entries: LedgerEntry[] = [
    ...seedFund(40_000).map((e) => ({ ...e, occurredAt: '2026-11-01T08:00:00.000Z' })),
    { ...sent, occurredAt: T.loan },
    { ...completeOf(sent, 500), occurredAt: T.loan },
    ...MEMBERS.filter((m) => m !== 'M7').map((m) => round4Payment(m, T.payments)),
    fine,
    round4Payment('M7', T.late),
    entry('AUTO_SETTLEMENT', autoSettlementPostings({ membershipId: 'M7', amount: 17_750 }), {
      membershipId: 'M7',
      occurredAt: T.payout,
    }),
  ];
  const withdrawal = sendOf('WITHDRAWAL', BENEFICIARY, 80_840, {
    feeEstimated: 500,
    feeActual: 500,
  });
  const completed = { ...completeOf(withdrawal, 500), occurredAt: T.withdrawal };
  entries.push({ ...withdrawal, occurredAt: T.withdrawal }, completed);
  const transactions = chainOf(entries);
  const seqOf = (id: string) => transactions.find((t) => t.id === id)!.seq;
  const payments: Record<string, number> = {};
  for (const m of MEMBERS) {
    const tx = transactions.find((t) => t.type === 'PAYMENT_RECEIVED' && t.refId === `pi-${m}`)!;
    payments[m] = tx.seq;
  }
  const facts = (m: string): ObligationFact[] => {
    const late = m === 'M7';
    const paidAt = late ? T.late : T.payments;
    const dueAt = '2026-11-21T17:00:00.000Z';
    return [
      {
        id: `ob-c-${m}`,
        membershipId: m,
        kind: 'CONTRIBUTION',
        amount: 10_000,
        roundId: 'R4',
        roundNumber: 4,
        dueAt,
        status: 'PAID',
        paidAt,
        onTime: !late,
      },
      {
        id: `ob-s-${m}`,
        membershipId: m,
        kind: 'SOLIDARITY',
        amount: 1_000,
        roundId: 'R4',
        roundNumber: 4,
        dueAt,
        status: 'PAID',
        paidAt,
        onTime: !late,
      },
    ];
  };
  const installment: ObligationFact = {
    id: 'ob-i-1',
    membershipId: BENEFICIARY,
    kind: 'LOAN_INSTALLMENT',
    amount: 16_750,
    roundId: 'R4',
    roundNumber: null,
    dueAt: '2026-11-21T17:00:00.000Z',
    status: 'SETTLED',
    paidAt: T.payout,
    onTime: true,
  };
  return {
    transactions,
    obligations: [...MEMBERS.flatMap(facts), installment],
    seq: { payments, withdrawal: seqOf(completed.id), fine: seqOf(fine.id) },
  };
}
