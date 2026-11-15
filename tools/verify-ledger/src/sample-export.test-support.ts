// A small but complete ledger export built with the public @njangi/rules API, for the tool's tests.

import {
  computeBalances,
  cycleStartedEvent,
  DEFAULT_RULE_SET,
  disbursementCompletedPostings,
  disbursementRefundedPostings,
  disbursementReturnedPostings,
  fineAssessedPostings,
  genesisHash,
  LEDGER_EXPORT_FORMAT,
  LEDGER_EXPORT_VERSION,
  loanSentPostings,
  paymentReceivedPostings,
  planClawbackReleases,
  planReversalCorrections,
  reversalPostings,
  sealTransaction,
  solidaritySentPostings,
  withdrawalSentPostings,
  type LedgerEntry,
  type LedgerExport,
  type LedgerTransaction,
  type Posting,
  type TransactionType,
} from '@njangi/rules';

export const GROUP_ID = '0f3a1c2e-5b6d-4e7f-8a9b-0c1d2e3f4a5b';
const MEMBERS = ['M1', 'M2', 'M3', 'M4'];

function entry(
  n: number,
  type: TransactionType,
  lines: Posting[] | { postings: Posting[]; metadata: object },
  membershipId: string | null = null,
): LedgerEntry {
  const { postings, metadata } = Array.isArray(lines) ? { postings: lines, metadata: {} } : lines;
  return {
    id: `tx-${n}`,
    type,
    occurredAt: new Date(Date.UTC(2026, 10, 2, 8, n)).toISOString(),
    roundId: type === 'EVENT' ? null : 'c1r1',
    membershipId,
    refType: null,
    refId: null,
    descriptionFr: `Écriture ${n}`,
    descriptionEn: `Entry ${n}`,
    metadata: metadata as LedgerEntry['metadata'],
    postings,
  };
}

/** D18.1: a withdrawal sent (in flight) and, unless `inFlight`, completed. */
function withdrawal(n: number, member: string, amount: number, inFlight = false): LedgerEntry[] {
  const operationId = `w${n}`;
  const sent = entry(
    n,
    'DISBURSEMENT_SENT',
    withdrawalSentPostings({ operationId, membershipId: member, amount, feeEstimated: 500 }),
    member,
  );
  if (inFlight) return [sent];
  const done = disbursementCompletedPostings({
    operationId,
    amount,
    feeEstimated: 500,
    feeActual: 500,
    feeSource: 'PROVIDER',
  });
  return [sent, entry(n + 1, 'WITHDRAWAL_COMPLETED', done, member)];
}

function seal(entries: LedgerEntry[]): LedgerTransaction[] {
  const transactions: LedgerTransaction[] = [];
  for (const e of entries) {
    transactions.push(
      sealTransaction({ groupId: GROUP_ID, previous: transactions.at(-1) ?? null, entry: e }),
    );
  }
  return transactions;
}

/** Cycle 1 drawn, round 1 paid by all four members, and one fine. */
function round1(): { draw: ReturnType<typeof cycleStartedEvent>; entries: LedgerEntry[] } {
  const draw = cycleStartedEvent({
    groupId: GROUP_ID,
    cycleNumber: 1,
    mode: 'FIXED',
    latestLedgerHash: genesisHash(GROUP_ID),
    activeMembershipIds: MEMBERS,
  });
  const beneficiary = draw.order[0]!;
  const entries: LedgerEntry[] = [entry(1, 'EVENT', { postings: [], metadata: draw })];
  MEMBERS.forEach((m, i) =>
    entries.push(
      entry(
        i + 2,
        'PAYMENT_RECEIVED',
        paymentReceivedPostings({
          payerMembershipId: m,
          fee: 100,
          feeSource: 'SCHEDULE',
          parts: [
            {
              kind: 'CONTRIBUTION',
              amount: 10_000,
              creditorMembershipId: beneficiary,
              tieOrder: 1,
            },
            { kind: 'SOLIDARITY', amount: 1_000 },
          ],
        }),
        m, // L3: every payment names its payer
      ),
    ),
  );
  entries.push(
    entry(6, 'FINE_ASSESSED', fineAssessedPostings({ membershipId: 'M3', amount: 1_000 })),
  );
  return { draw, entries };
}

/** Cycle 1 drawn, round 1 paid by all four members, one fine, and the payout withdrawn. */
export function sampleExport(): LedgerExport {
  const { draw, entries } = round1();
  return exportOf(draw, seal([...entries, ...withdrawal(7, draw.order[0]!, 39_136)]));
}

/**
 * L6, H1: the beneficiary withdrew 30 000 and has 3 000 more in flight when member 1's payment is
 * reversed: a CLAWBACK makes them owe what they no longer hold; cash stays below what is reserved
 * until they pay (a warning, not a problem).
 */
export function correctionsExport(): LedgerExport {
  const { draw, entries: base } = round1();
  const entries = [
    ...base,
    ...withdrawal(7, draw.order[0]!, 30_000),
    ...withdrawal(9, draw.order[0]!, 3_000, true),
  ];
  const before = seal(entries);
  const target = before[1]!;
  const corrections = planReversalCorrections({ original: target, ledger: before }).map((c, i) => ({
    ...entry(10 + i, c.type, { postings: c.postings, metadata: c.metadata }, c.membershipId),
  }));
  const reversal = {
    ...entry(10 + corrections.length, 'REVERSAL', reversalPostings(target.postings)),
    refType: 'LEDGER_TRANSACTION',
    refId: target.id,
    metadata: { reversesSeq: target.seq },
  };
  return exportOf(draw, seal([...entries, ...corrections, reversal]));
}

/** D22.1: the payout withdrawn, then reversed by the operator and refunded in full. */
export function refundExport(): LedgerExport {
  const { draw, entries } = round1();
  const paid = withdrawal(7, draw.order[0]!, 39_136);
  const refund = disbursementRefundedPostings({
    sent: paid[0]!,
    completed: paid[1]!,
    completedSeq: 8,
    feeKept: 0,
  });
  return exportOf(
    draw,
    seal([...entries, ...paid, entry(9, 'DISBURSEMENT_REFUNDED', refund, paid[0]!.membershipId)]),
  );
}

/** H1: a loan sent while nothing is available for loans (everything is reserved). */
export function lendingExport(): LedgerExport {
  const { draw, entries } = round1();
  const loan = loanSentPostings({
    operationId: 'l9',
    membershipId: 'M2',
    principal: 1_000,
    interest: 100,
    feeEstimated: 500,
  });
  return exportOf(
    draw,
    seal([
      ...entries,
      ...withdrawal(7, draw.order[0]!, 39_136),
      entry(9, 'DISBURSEMENT_SENT', loan, 'M2'),
    ]),
  );
}

/**
 * Owner Q1: the whole solidarity fund (3 964) is on its way to M2 when member 1's payment is
 * reversed: the payer owes its solidarity part (CLAWBACK). The send then fails: the money back in the
 * fund releases that debt (CLAWBACK_RELEASE) right after the return.
 */
export function releaseExport(): LedgerExport {
  const { draw, entries: base } = round1();
  const sent = solidaritySentPostings({ operationId: 's7', amount: 3_964, feeEstimated: 500 });
  const entries = [...base, entry(7, 'DISBURSEMENT_SENT', sent, 'M2')];
  const before = seal(entries);
  const target = before[1]!;
  const corrections = planReversalCorrections({ original: target, ledger: before }).map((c, i) =>
    entry(8 + i, c.type, { postings: c.postings, metadata: c.metadata }, c.membershipId),
  );
  const reversal = {
    ...entry(8 + corrections.length, 'REVERSAL', reversalPostings(target.postings)),
    refType: 'LEDGER_TRANSACTION',
    refId: target.id,
    metadata: { reversesSeq: target.seq },
  };
  const n = 9 + corrections.length;
  const returned = entry(
    n,
    'DISBURSEMENT_RETURNED',
    { postings: disbursementReturnedPostings(sent.postings), metadata: { sentSeq: 7 } },
    'M2',
  );
  const sealed = seal([...entries, ...corrections, reversal, returned]);
  const releases = planClawbackReleases({
    ledger: sealed,
    returned: sealed.at(-1)!,
    debtUnpaid: () => true,
  }).map((r, i) =>
    entry(n + 1 + i, r.type, { postings: r.postings, metadata: r.metadata }, r.membershipId),
  );
  return exportOf(draw, seal([...entries, ...corrections, reversal, returned, ...releases]));
}

/** N5: two fines of 2^51 each: the balances' total size passes 2^53 at the second one. */
export function hugeExport(): LedgerExport {
  const { draw, entries } = round1();
  const fine = (n: number) =>
    entry(n, 'FINE_ASSESSED', fineAssessedPostings({ membershipId: 'M2', amount: 2 ** 51 }));
  const transactions = seal([...entries, fine(7), fine(8)]);
  return {
    ...exportOf(draw, transactions.slice(0, -1)),
    transactions,
    head: { seq: transactions.at(-1)!.seq, hash: transactions.at(-1)!.hash },
  };
}

function exportOf(
  draw: ReturnType<typeof cycleStartedEvent>,
  transactions: LedgerTransaction[],
): LedgerExport {
  const last = transactions.at(-1)!;
  return {
    format: LEDGER_EXPORT_FORMAT,
    version: LEDGER_EXPORT_VERSION,
    exportedAt: '2026-11-03T06:00:00.000Z',
    group: { id: GROUP_ID, name: 'Njangi du quartier' },
    members: MEMBERS.map((m, i) => ({
      membershipId: m,
      name: `Membre ${i + 1}`,
      role: i === 0 ? 'ADMIN' : 'MEMBER',
      status: 'ACTIVE',
      paymentNumberMasked: '6•• •• •4 56',
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
        startedAt: '2026-11-02T08:00:00.000Z',
        closedAt: null,
      },
    ],
    proposals: [],
    transactions,
    head: { seq: last.seq, hash: last.hash },
    balances: Object.fromEntries(computeBalances(transactions)),
  };
}
