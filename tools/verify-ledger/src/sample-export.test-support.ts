// A small but complete ledger export built with the public @njangi/rules API, for the tool's tests.

import {
  computeBalances,
  cycleStartedEvent,
  DEFAULT_RULE_SET,
  fineAssessedPostings,
  genesisHash,
  LEDGER_EXPORT_FORMAT,
  LEDGER_EXPORT_VERSION,
  paymentReceivedPostings,
  sealTransaction,
  withdrawalCompletedPostings,
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
  postings: Posting[],
  metadata: LedgerEntry['metadata'] = {},
): LedgerEntry {
  return {
    id: `tx-${n}`,
    type,
    occurredAt: new Date(Date.UTC(2026, 10, 2, 8, n)).toISOString(),
    roundId: type === 'EVENT' ? null : 'c1r1',
    membershipId: null,
    refType: null,
    refId: null,
    descriptionFr: `Écriture ${n}`,
    descriptionEn: `Entry ${n}`,
    metadata,
    postings,
  };
}

/** Cycle 1 drawn, round 1 paid by all four members, one fine, and the payout withdrawn. */
export function sampleExport(): LedgerExport {
  const draw = cycleStartedEvent({
    groupId: GROUP_ID,
    cycleNumber: 1,
    mode: 'FIXED',
    latestLedgerHash: genesisHash(GROUP_ID),
    activeMembershipIds: MEMBERS,
  });
  const beneficiary = draw.order[0]!;
  const entries: LedgerEntry[] = [entry(1, 'EVENT', [], draw)];
  MEMBERS.forEach((m, i) =>
    entries.push(
      entry(
        i + 2,
        'PAYMENT_RECEIVED',
        paymentReceivedPostings({
          payerMembershipId: m,
          fee: 100,
          parts: [
            { kind: 'CONTRIBUTION', amount: 10_000, creditorMembershipId: beneficiary },
            { kind: 'SOLIDARITY', amount: 1_000 },
          ],
        }).postings,
      ),
    ),
  );
  entries.push(
    entry(6, 'FINE_ASSESSED', fineAssessedPostings({ membershipId: 'M3', amount: 1_000 })),
  );
  entries.push(
    entry(
      7,
      'WITHDRAWAL_COMPLETED',
      withdrawalCompletedPostings({
        membershipId: beneficiary,
        amount: 39_136,
        feeEstimated: 500,
        feeActual: 500,
      }),
    ),
  );
  const transactions: LedgerTransaction[] = [];
  for (const e of entries) {
    transactions.push(
      sealTransaction({ groupId: GROUP_ID, previous: transactions.at(-1) ?? null, entry: e }),
    );
  }
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
