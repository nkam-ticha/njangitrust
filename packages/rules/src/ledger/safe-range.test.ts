import { describe, expect, it } from 'vitest';
import { applyPostings, computeBalances, tryApplyPostings } from './balances';
import { coverageGaps } from './coverage';
import { sampleExport } from './export.test-support';
import { sealTransaction } from './hash-chain';
import { checkLedger } from './invariants';
import { chainOf, entry, TEST_GROUP } from './ledger.test-support';
import { fineAssessedPostings } from './postings';
import type { LedgerTransaction } from './types';
import { verifyLedgerExport } from './verify-export';

// 2^51: two such fines make the balances' total size 2^53, past Number.MAX_SAFE_INTEGER.
const HUGE = 2 ** 51;
const hugeFine = () =>
  entry('FINE_ASSESSED', fineAssessedPostings({ membershipId: 'M1', amount: HUGE }));

describe('balances beyond the safe integer range (audit 5 N5)', () => {
  it('refuses postings whose balances would no longer add up exactly', () => {
    const once = applyPostings(new Map(), hugeFine().postings);
    expect(tryApplyPostings(once, hugeFine().postings)).toBeNull();
    expect(() => applyPostings(once, hugeFine().postings)).toThrow(RangeError);
    expect(tryApplyPostings(new Map(), hugeFine().postings)).toEqual(once);
  });

  it('reports MALFORMED_TRANSACTION at the seq that leaves the range instead of throwing', () => {
    const chain = chainOf([hugeFine(), hugeFine(), hugeFine()]);
    expect(checkLedger(TEST_GROUP, chain)).toEqual([
      { seq: 2, code: 'MALFORMED_TRANSACTION', detail: expect.stringContaining('safe') },
      { seq: 3, code: 'MALFORMED_TRANSACTION', detail: expect.stringContaining('safe') },
    ]);
    expect(coverageGaps(chain)).toEqual([]);
  });

  it('verifies such an export without throwing (the transaction is skipped)', () => {
    const base = sampleExport();
    const transactions: LedgerTransaction[] = [...base.transactions];
    for (const e of [hugeFine(), hugeFine()])
      transactions.push(
        sealTransaction({ groupId: TEST_GROUP, previous: transactions.at(-1)!, entry: e }),
      );
    const last = transactions.at(-1)!;
    const claimed = Object.fromEntries(computeBalances(transactions.slice(0, -1)));
    const result = verifyLedgerExport({
      ...base,
      transactions,
      head: { seq: last.seq, hash: last.hash },
      balances: claimed,
    });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([
      { seq: last.seq, code: 'MALFORMED_TRANSACTION', detail: expect.stringContaining('safe') },
    ]);
  });
});
