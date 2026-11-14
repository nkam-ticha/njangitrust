// A realistic sample export for verifier tests. Not part of the package's public API.

import type { PaymentPart } from '../fees';
import { DEFAULT_RULE_SET } from '../ruleset';
import { computeBalances } from './balances';
import { cycleStartedEvent } from './events';
import { LEDGER_EXPORT_FORMAT, LEDGER_EXPORT_VERSION, type LedgerExport } from './export-format';
import { genesisHash } from './hash-chain';
import { planReversalCorrections } from './corrections';
import { paymentReceivedPostings } from './fee-postings';
import { chainOf, entry, paidOut, TEST_GROUP } from './ledger.test-support';
import { fineAssessedPostings, reversalPostings } from './postings';
import type { LedgerEntry } from './types';

export const SAMPLE_MEMBERS = Array.from({ length: 10 }, (_, i) => `M${i + 1}`);

const pay = (payer: string, parts: PaymentPart[]) =>
  entry(
    'PAYMENT_RECEIVED',
    paymentReceivedPostings({ payerMembershipId: payer, fee: 100, feeSource: 'SCHEDULE', parts }),
    {
      membershipId: payer,
      refType: 'PAYMENT_INTENT',
      refId: `pi-${payer}-${parts.length}`,
    },
  );

/** One FIXED cycle: draw, a full round paid, a fine paid, the payout withdrawn, a solidarity payout, a waived fine. */
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
        { kind: 'CONTRIBUTION', amount: 10_000, creditorMembershipId: beneficiary, tieOrder: 1 },
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
  // D18.1: each payout is sent (in flight), then completed.
  entries.push(...paidOut('WITHDRAWAL', beneficiary, 98_590));
  entries.push(...paidOut('SOLIDARITY', 'M2', 5_000, { feeActual: 600 }));
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

/**
 * L6, H1: a group where a withdrawal is completed, another is still in flight, and a payment is then
 * reversed: a CLAWBACK makes the beneficiary owe what they no longer hold, and cash stays below what
 * is reserved until that debt is paid (a warning, not a problem).
 */
export function correctionsExport(): LedgerExport {
  const round4 = (payer: string) =>
    pay(payer, [
      { kind: 'CONTRIBUTION', amount: 10_000, creditorMembershipId: 'M7', tieOrder: 7 },
      { kind: 'SOLIDARITY', amount: 1_000 },
    ]);
  const before: LedgerEntry[] = [
    entry('FINE_ASSESSED', fineAssessedPostings({ membershipId: 'M5', amount: 5_000 }), {
      membershipId: 'M5',
    }),
    pay('M5', [{ kind: 'DEBT', amount: 5_000 }]),
    round4('M3'),
    round4('M4'),
    ...paidOut('WITHDRAWAL', 'M7', 12_000),
  ];
  before.push(paidOut('WITHDRAWAL', 'M7', 2_500)[0]!);
  const chain = chainOf(before);
  const target = chain[2]!;
  const corrections = planReversalCorrections({ original: target, ledger: chain }).map((c) =>
    entry(c.type, { postings: c.postings, metadata: c.metadata }, { membershipId: c.membershipId }),
  );
  const transactions = chainOf([
    ...before,
    ...corrections,
    entry('REVERSAL', reversalPostings(target.postings), {
      refType: 'LEDGER_TRANSACTION',
      refId: target.id,
      metadata: { reversesSeq: target.seq },
    }),
  ]);
  const last = transactions.at(-1)!;
  return {
    ...sampleExport(),
    cycles: [],
    proposals: [],
    transactions,
    head: { seq: last.seq, hash: last.hash },
    balances: Object.fromEntries(computeBalances(transactions)),
  };
}
