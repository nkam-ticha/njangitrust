import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  computeTransactionHash,
  genesisHash,
  hashContent,
  sealTransaction,
  verifyChain,
} from './hash-chain';
import type { LedgerEntry, LedgerTransaction } from './types';

const GROUP = '9b2e0c4e-1111-4a5b-8c9d-000000000001';
const GENESIS = '43570e24d2c071a06fe4bb72b80de45bf70d725583a255e202bfb0d6ad13956a';
const nodeSha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

const fine: LedgerEntry = {
  id: 'tx-1',
  type: 'FINE_ASSESSED',
  occurredAt: '2026-11-27T17:00:00.000Z',
  roundId: 'r4',
  membershipId: 'M5',
  refType: 'OBLIGATION',
  refId: 'ob-1',
  descriptionFr: 'Amende, tour 4',
  descriptionEn: 'Fine, round 4',
  metadata: { round: 4 },
  postings: [
    { account: 'receivable:member:M5', amount: 1_000 },
    { account: 'fund:general', amount: -1_000 },
  ],
};

function chain(n: number): LedgerTransaction[] {
  const out: LedgerTransaction[] = [];
  for (let i = 0; i < n; i++) {
    const previous = out[i - 1] ?? null;
    out.push(sealTransaction({ groupId: GROUP, previous, entry: { ...fine, id: `tx-${i + 1}` } }));
  }
  return out;
}

describe('hash chain (2.5 invariant 5, D6)', () => {
  it('starts from SHA-256("njangitrust:" + groupId)', () => {
    expect(genesisHash(GROUP)).toBe(GENESIS);
  });

  it('hashes prevHash + canonical JSON of every field but hash, postings sorted (golden)', () => {
    const tx = sealTransaction({ groupId: GROUP, previous: null, entry: fine });
    const canonical =
      '{"descriptionEn":"Fine, round 4","descriptionFr":"Amende, tour 4","groupId":"' +
      GROUP +
      '","id":"tx-1","membershipId":"M5","metadata":{"round":4},' +
      '"occurredAt":"2026-11-27T17:00:00.000Z","postings":[{"account":"fund:general","amount":-1000},' +
      '{"account":"receivable:member:M5","amount":1000}],"prevHash":"' +
      GENESIS +
      '","refId":"ob-1","refType":"OBLIGATION","roundId":"r4","seq":1,"type":"FINE_ASSESSED"}';
    expect(tx.seq).toBe(1);
    expect(tx.prevHash).toBe(GENESIS);
    expect(tx.hash).toBe(nodeSha(GENESIS + canonical));
    expect(computeTransactionHash(tx)).toBe(tx.hash);
  });

  it('sorts postings by account then amount, so their order never changes the hash', () => {
    const a = hashContent({ ...fine, groupId: GROUP, seq: 1, prevHash: GENESIS });
    const b = hashContent({
      ...fine,
      postings: [...fine.postings].reverse(),
      groupId: GROUP,
      seq: 1,
      prevHash: GENESIS,
    });
    expect(a).toEqual(b);
  });

  it('links each transaction to the previous hash with a gap-free seq', () => {
    const txs = chain(3);
    expect(txs.map((t) => t.seq)).toEqual([1, 2, 3]);
    expect(txs[1]!.prevHash).toBe(txs[0]!.hash);
    expect(txs[2]!.prevHash).toBe(txs[1]!.hash);
    expect(verifyChain(GROUP, txs)).toEqual([]);
  });

  it('refuses to seal entries that break the ledger rules', () => {
    const seal = (entry: LedgerEntry) => () =>
      sealTransaction({ groupId: GROUP, previous: null, entry });
    expect(seal({ ...fine, occurredAt: '2026-11-27 18:00' })).toThrow(RangeError);
    expect(seal({ ...fine, postings: [{ account: 'fund:general', amount: -1_000 }] })).toThrow(
      RangeError,
    );
    expect(
      seal({
        ...fine,
        postings: [
          { account: 'receivable:member:M5', amount: 1_000.5 },
          { account: 'fund:general', amount: -1_000.5 },
        ],
      }),
    ).toThrow(RangeError);
    expect(seal({ ...fine, type: 'EVENT' })).toThrow(RangeError); // EVENT has no postings
    expect(seal({ ...fine, metadata: { ratio: 0.5 } })).toThrow(RangeError);
  });

  it('reports the exact seq of a changed field, a changed hash, a removed or reordered entry', () => {
    const txs = chain(5);
    const changed = txs.map((t) => (t.seq === 3 ? { ...t, descriptionFr: 'Autre' } : t));
    expect(verifyChain(GROUP, changed)[0]).toMatchObject({ seq: 3, code: 'HASH_MISMATCH' });

    const rehashed = txs.map((t) => (t.seq === 2 ? { ...t, hash: 'f'.repeat(64) } : t));
    expect(verifyChain(GROUP, rehashed).map((p) => [p.seq, p.code])).toEqual([
      [2, 'HASH_MISMATCH'],
      [3, 'PREV_HASH_MISMATCH'],
    ]);

    const removed = txs.filter((t) => t.seq !== 4);
    expect(verifyChain(GROUP, removed)[0]).toMatchObject({ seq: 4, code: 'SEQ_GAP' });

    const reordered = [txs[0]!, txs[2]!, txs[1]!, txs[3]!, txs[4]!];
    expect(verifyChain(GROUP, reordered)[0]).toMatchObject({ seq: 2, code: 'SEQ_GAP' });

    const otherGroup = txs.map((t) => (t.seq === 5 ? { ...t, groupId: 'other' } : t));
    expect(verifyChain(GROUP, otherGroup)[0]).toMatchObject({ seq: 5, code: 'GROUP_MISMATCH' });

    const renumbered = txs.map((t) => (t.seq === 3 ? { ...t, seq: 4 } : t));
    expect(verifyChain(GROUP, renumbered)[0]).toMatchObject({ seq: 3, code: 'SEQ_GAP' });
  });
});
