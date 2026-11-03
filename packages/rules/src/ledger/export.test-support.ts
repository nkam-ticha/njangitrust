// A realistic sample export for verifier tests. Not part of the package's public API.

import type { PaymentPart } from '../fees';
import { DEFAULT_RULE_SET } from '../ruleset';
import { computeBalances } from './balances';
import { cycleStartedEvent } from './events';
import { LEDGER_EXPORT_FORMAT, LEDGER_EXPORT_VERSION, type LedgerExport } from './export-format';
import { genesisHash } from './hash-chain';
import { chainOf, entry, TEST_GROUP } from './ledger.test-support';
import {
  fineAssessedPostings,
  paymentReceivedPostings,
  reversalPostings,
  solidarityDisbursedPostings,
  withdrawalCompletedPostings,
} from './postings';
import type { LedgerEntry } from './types';

export const SAMPLE_MEMBERS = Array.from({ length: 10 }, (_, i) => `M${i + 1}`);

const pay = (payer: string, parts: PaymentPart[]) =>
  entry(
    'PAYMENT_RECEIVED',
    paymentReceivedPostings({ payerMembershipId: payer, fee: 100, parts }).postings,
    {
      membershipId: payer,
      refType: 'PAYMENT_INTENT',
      refId: `pi-${payer}-${parts.length}`,
    },
  );

/** One FIXED cycle: draw, a full round paid, a fine paid, the payout withdrawn, a waived fine. */
export function sampleExport(): LedgerExport {
  const draw = cycleStartedEvent({
    groupId: TEST_GROUP,
    cycleNumber: 1,
    mode: 'FIXED',
    latestLedgerHash: genesisHash(TEST_GROUP),
    activeMembershipIds: SAMPLE_MEMBERS,
  });
  const beneficiary = draw.order[0]!;
  const entries: LedgerEntry[] = [
    entry('EVENT', [], { metadata: draw, descriptionFr: 'Tirage du cycle 1' }),
  ];
  for (const m of SAMPLE_MEMBERS) {
    entries.push(
      pay(m, [
        { kind: 'CONTRIBUTION', amount: 10_000, creditorMembershipId: beneficiary },
        { kind: 'SOLIDARITY', amount: 1_000 },
      ]),
    );
  }
  entries.push(
    entry('FINE_ASSESSED', fineAssessedPostings({ membershipId: 'M5', amount: 1_000 }), {
      membershipId: 'M5',
    }),
  );
  entries.push(pay('M5', [{ kind: 'DEBT', amount: 1_000 }]));
  entries.push(
    entry(
      'WITHDRAWAL_COMPLETED',
      withdrawalCompletedPostings({
        membershipId: beneficiary,
        amount: 98_590,
        feeEstimated: 500,
        feeActual: 500,
      }),
      { membershipId: beneficiary },
    ),
  );
  entries.push(
    entry(
      'SOLIDARITY_DISBURSED',
      solidarityDisbursedPostings({ amount: 5_000, feeEstimated: 500, feeActual: 600 }),
    ),
  );
  const fine = entry('FINE_ASSESSED', fineAssessedPostings({ membershipId: 'M2', amount: 1_000 }), {
    membershipId: 'M2',
  });
  entries.push(fine);
  const fineSeq = entries.length;
  entries.push(
    entry('REVERSAL', reversalPostings(fine.postings), {
      refType: 'LEDGER_TRANSACTION',
      refId: fine.id,
      metadata: { reversesSeq: fineSeq, proposalId: 'p-waiver' },
    }),
  );
  entries.push(
    entry('EVENT', [], {
      metadata: {
        event: 'VOTE_CLOSED',
        proposalId: 'p-waiver',
        proposalType: 'FINE_WAIVER',
        status: 'PASSED',
        yes: 6,
        no: 1,
        eligible: 9,
      },
    }),
  );
  const transactions = chainOf(entries);
  const last = transactions.at(-1)!;
  return {
    format: LEDGER_EXPORT_FORMAT,
    version: LEDGER_EXPORT_VERSION,
    exportedAt: '2026-12-01T06:00:00.000Z',
    group: { id: TEST_GROUP, name: 'Njangi des Collègues' },
    members: SAMPLE_MEMBERS.map((m, i) => ({
      membershipId: m,
      name: `Membre ${i + 1}`,
      role: i === 0 ? 'ADMIN' : 'MEMBER',
      status: 'ACTIVE',
      paymentNumberMasked: '6•• •• •7 89',
    })),
    ruleSets: [
      {
        version: 1,
        params: { ...DEFAULT_RULE_SET },
        effectiveFromRoundId: null,
        createdByProposalId: null,
      },
    ],
    cycles: [
      {
        number: 1,
        mode: 'FIXED',
        drawSeed: draw.drawSeed,
        rotation: draw.order,
        startedAt: '2026-11-01T00:00:00.000Z',
        closedAt: null,
      },
    ],
    proposals: [
      {
        id: 'p-waiver',
        type: 'FINE_WAIVER',
        secret: false,
        thresholdKind: 'MAJORITY',
        eligibleCount: 9,
        yesCount: 6,
        noCount: 1,
        status: 'PASSED',
        opensAt: '2026-11-20T08:00:00.000Z',
        closesAt: '2026-11-23T08:00:00.000Z',
        appliedAt: '2026-11-21T08:00:00.000Z',
        ballots: [
          ...['M1', 'M3', 'M4', 'M5', 'M6', 'M7'].map((m) => ({
            membershipId: m,
            choice: 'YES' as const,
          })),
          { membershipId: 'M8', choice: 'NO' as const },
        ],
      },
      {
        id: 'p-remove',
        type: 'MEMBER_REMOVE',
        secret: true,
        thresholdKind: 'MAJORITY',
        eligibleCount: 9,
        yesCount: 2,
        noCount: 6,
        status: 'REJECTED',
        opensAt: '2026-11-20T08:00:00.000Z',
        closesAt: '2026-11-23T08:00:00.000Z',
        appliedAt: null,
        ballots: null,
      },
    ],
    transactions,
    head: { seq: last.seq, hash: last.hash },
    balances: Object.fromEntries(computeBalances(transactions)),
  };
}
