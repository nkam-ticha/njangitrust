import { describe, expect, it } from 'vitest';
import { correctionsExport, sampleExport } from './export.test-support';
import { computeTransactionHash } from './hash-chain';
import { chainOf, entry, TEST_GROUP } from './ledger.test-support';
import type { LedgerTransaction } from './types';
import { verifyLedgerExport } from './verify-export';

type Mutation = [string, (tx: LedgerTransaction) => LedgerTransaction];

const flip = (hex: string) => hex.slice(0, -1) + (hex.endsWith('0') ? '1' : '0');
const MUTATIONS: Mutation[] = [
  ['id', (t) => ({ ...t, id: `${t.id}x` })],
  ['groupId', (t) => ({ ...t, groupId: `${t.groupId}x` })],
  ['seq', (t) => ({ ...t, seq: t.seq + 1 })],
  ['type', (t) => ({ ...t, type: t.type === 'BID_ASSESSED' ? 'FINE_ASSESSED' : 'BID_ASSESSED' })],
  [
    'occurredAt',
    (t) => ({ ...t, occurredAt: new Date(Date.parse(t.occurredAt) + 1).toISOString() }),
  ],
  ['roundId', (t) => ({ ...t, roundId: `${t.roundId ?? ''}x` })],
  ['membershipId', (t) => ({ ...t, membershipId: `${t.membershipId ?? ''}x` })],
  ['refType', (t) => ({ ...t, refType: `${t.refType ?? ''}x` })],
  ['refId', (t) => ({ ...t, refId: `${t.refId ?? ''}x` })],
  ['descriptionFr', (t) => ({ ...t, descriptionFr: `${t.descriptionFr}.` })],
  ['descriptionEn', (t) => ({ ...t, descriptionEn: `${t.descriptionEn}.` })],
  ['metadata', (t) => ({ ...t, metadata: { ...t.metadata, tampered: 1 } })],
  ['prevHash', (t) => ({ ...t, prevHash: flip(t.prevHash) })],
  ['hash', (t) => ({ ...t, hash: flip(t.hash) })],
  [
    'posting amount',
    (t) => ({
      ...t,
      postings: t.postings.map((p, i) => (i === 0 ? { ...p, amount: p.amount + 1 } : p)),
    }),
  ],
  [
    'posting account',
    (t) => ({
      ...t,
      postings: t.postings.map((p, i) => (i === 0 ? { ...p, account: 'payable:member:EVIL' } : p)),
    }),
  ],
  ['posting removed', (t) => ({ ...t, postings: t.postings.slice(1) })],
  [
    'posting added',
    (t) => ({ ...t, postings: [...t.postings, { account: 'cash:provider', amount: 1 }] }),
  ],
];

describe('verifying an audit export (2.14, spec 5.2)', () => {
  it('prints OK for an untouched export', () => {
    const result = verifyLedgerExport(sampleExport());
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.summary).toMatchObject({
      transactions: 20,
      headSeq: 20,
      cash: 5_710,
      solidarityFund: 4_910,
      generalFund: 800,
      inFlight: 0,
    });
    expect(result.warnings).toEqual([]);
  });

  it('accepts corrections and payouts in flight; uncovered money is a warning, not a problem (L6, H1)', () => {
    const file = correctionsExport();
    expect(file.transactions.map((t) => t.type).slice(-4)).toEqual([
      'WITHDRAWAL_COMPLETED',
      'DISBURSEMENT_SENT',
      'CLAWBACK',
      'REVERSAL',
    ]);
    const result = verifyLedgerExport(file);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.summary).toMatchObject({ inFlight: 3_000, receivables: 5_591 });
    expect(result.warnings).toEqual([
      { code: 'RESERVED_NOT_COVERED', detail: expect.stringContaining('uncovered now: 691') },
    ]);
  });

  it('fails at the exact seq when any field of any stored transaction changes', () => {
    const original = sampleExport();
    let checked = 0;
    for (const tx of original.transactions) {
      for (const [field, mutate] of MUTATIONS) {
        if (field.startsWith('posting') && tx.postings.length === 0 && field !== 'posting added')
          continue;
        const tampered = {
          ...original,
          transactions: original.transactions.map((t) => (t.seq === tx.seq ? mutate(t) : t)),
        };
        const result = verifyLedgerExport(tampered);
        expect(result.ok, `${field} at seq ${tx.seq}`).toBe(false);
        expect(result.problems[0]?.seq, `${field} at seq ${tx.seq}`).toBe(tx.seq);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(250);
  });

  it('cross-checks each payment part’s tie order against the rotation (L2)', () => {
    const original = sampleExport();
    // A forger shifts the beneficiary's tie order, re-hashing everything from there.
    const forged = original.transactions.map((t) => ({
      ...t,
      metadata: structuredClone(t.metadata),
    }));
    const parts = (forged[1]!.metadata as { parts: { tieOrder: number }[] }).parts;
    parts[0]!.tieOrder = 7;
    for (let i = 1; i < forged.length; i++) {
      forged[i]!.prevHash = forged[i - 1]!.hash;
      const { hash: _h, ...rest } = forged[i]!;
      forged[i]!.hash = computeTransactionHash(rest);
    }
    const last = forged.at(-1)!;
    const problems = verifyLedgerExport({
      ...original,
      transactions: forged,
      head: { seq: last.seq, hash: last.hash },
    }).problems;
    expect(problems[0]).toMatchObject({
      seq: 2,
      code: 'FEE_MISMATCH',
      detail: expect.stringContaining('tie order'),
    });
  });

  it('refuses any transaction field outside the hashed record, at its seq (D12)', () => {
    const original = sampleExport();
    for (const tx of original.transactions) {
      const withCreatedAt = {
        ...original,
        transactions: original.transactions.map((t) =>
          t.seq === tx.seq ? { ...t, createdAt: '2026-11-01T00:00:00.000Z' } : t,
        ),
      };
      expect(verifyLedgerExport(withCreatedAt).problems[0]).toMatchObject({
        seq: tx.seq,
        code: 'UNHASHED_FIELD',
      });
    }
    const postingExtra = {
      ...original,
      transactions: original.transactions.map((t) =>
        t.seq === 3 ? { ...t, postings: t.postings.map((p) => ({ ...p, note: 'x' })) } : t,
      ),
    };
    expect(verifyLedgerExport(postingExtra).problems[0]).toMatchObject({
      seq: 3,
      code: 'UNHASHED_FIELD',
    });
  });

  it('detects a truncated export through its head', () => {
    const original = sampleExport();
    const truncated = { ...original, transactions: original.transactions.slice(0, -1) };
    expect(verifyLedgerExport(truncated).problems).toEqual([
      expect.objectContaining({ seq: 20, code: 'HEAD_MISMATCH' }),
    ]);
  });

  it('detects claimed balances that the postings do not support', () => {
    const original = sampleExport();
    const result = verifyLedgerExport({
      ...original,
      balances: { ...original.balances, 'cash:provider': 1 },
    });
    expect(result.problems).toEqual([
      expect.objectContaining({ seq: null, code: 'BALANCE_MISMATCH' }),
    ]);
  });

  it('re-runs the draw and refuses an order or seed that does not follow R2.3', () => {
    const original = sampleExport();
    const event = original.transactions[0]!.metadata as { order: string[] };
    const swapped = {
      ...event,
      order: [event.order[1]!, event.order[0]!, ...event.order.slice(2)],
    };
    const transactions = chainOf([entry('EVENT', [], { metadata: swapped })]);
    const forged = {
      ...original,
      transactions,
      head: { seq: 1, hash: transactions[0]!.hash },
      balances: {},
      cycles: [{ ...original.cycles[0]!, rotation: swapped.order }],
    };
    expect(verifyLedgerExport(forged).problems[0]).toMatchObject({ seq: 1, code: 'DRAW_MISMATCH' });
    const wrongSeed = {
      ...original,
      cycles: [{ ...original.cycles[0]!, drawSeed: 'a'.repeat(64) }],
    };
    expect(verifyLedgerExport(wrongSeed).problems[0]).toMatchObject({
      seq: 1,
      code: 'DRAW_MISMATCH',
    });
  });

  it('refuses inconsistent proposal tallies and secret ballots linked to voters', () => {
    const original = sampleExport();
    const [waiver, removal] = original.proposals;
    const withProposals = (proposals: typeof original.proposals) =>
      verifyLedgerExport({ ...original, proposals }).problems;
    expect(withProposals([{ ...waiver!, yesCount: 4, noCount: 3 }, removal!])[0]).toMatchObject({
      code: 'PROPOSAL_INCONSISTENT',
    });
    expect(
      withProposals([
        waiver!,
        { ...removal!, ballots: [{ membershipId: 'M1', choice: 'YES' }] },
      ])[0],
    ).toMatchObject({
      code: 'PROPOSAL_INCONSISTENT',
    });
    expect(withProposals([waiver!, { ...removal!, yesCount: 9, noCount: 6 }])[0]).toMatchObject({
      code: 'PROPOSAL_INCONSISTENT',
    });
  });

  it('refuses an export that shows a phone number unmasked', () => {
    const original = sampleExport();
    const members = original.members.map((m, i) =>
      i === 2 ? { ...m, paymentNumberMasked: '677 12 34 56' } : m,
    );
    expect(verifyLedgerExport({ ...original, members }).problems).toEqual([
      expect.objectContaining({ seq: null, code: 'UNMASKED_PHONE_NUMBER' }),
    ]);
  });

  it('refuses files that are not a NjangiTrust ledger export', () => {
    for (const bad of [
      null,
      'text',
      {},
      { ...sampleExport(), format: 'other' },
      { ...sampleExport(), transactions: 'x' },
    ]) {
      const result = verifyLedgerExport(bad);
      expect(result.ok).toBe(false);
      expect(result.problems[0]).toMatchObject({ seq: null, code: 'MALFORMED_EXPORT' });
    }
  });

  it('accepts an export of a group with no transactions yet', () => {
    const empty = {
      ...sampleExport(),
      transactions: [],
      head: null,
      balances: {},
      cycles: [],
      proposals: [],
    };
    expect(verifyLedgerExport(empty)).toMatchObject({ ok: true, problems: [] });
    expect(verifyLedgerExport({ ...empty, group: { id: TEST_GROUP, name: 'x' } }).ok).toBe(true);
  });
});
