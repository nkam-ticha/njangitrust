import { describe, expect, it } from 'vitest';
import { computeBalances, summarizeBalances } from './balances';
import { planReversalCorrections } from './corrections';
import { reservedShortfall } from './derived';
import { paymentReceivedPostings } from './fee-postings';
import { checkLedger } from './invariants';
import { chainOf, entry, forgedChainOf, paidOut, TEST_GROUP } from './ledger.test-support';
import { reversalPostings } from './postings';
import type { LedgerEntry } from './types';

const pay = (
  payer: string,
  parts: Parameters<typeof paymentReceivedPostings>[0]['parts'],
  fee = 100,
) =>
  entry(
    'PAYMENT_RECEIVED',
    paymentReceivedPostings({ payerMembershipId: payer, fee, feeSource: 'SCHEDULE', parts }),
    { membershipId: payer },
  );
const round = (beneficiary: string) => [
  { kind: 'CONTRIBUTION' as const, amount: 10_000, creditorMembershipId: beneficiary },
  { kind: 'SOLIDARITY' as const, amount: 1_000 },
];

/** The general fund stays at 0: M7 withdrew, M3's payment is reversed, M7 owes 5 591 (D16.1). */
function broken(): LedgerEntry[] {
  const before: LedgerEntry[] = [
    pay('M3', round('M7')),
    pay('M4', round('M7')),
    pay('M5', round('M9')),
    ...paidOut('WITHDRAWAL', 'M7', 15_000),
  ];
  const chain = chainOf(before);
  const corrections = planReversalCorrections({ original: chain[0]!, ledger: chain }).map((c) =>
    entry(c.type, { postings: c.postings, metadata: c.metadata }, { membershipId: c.membershipId }),
  );
  return [
    ...before,
    ...corrections,
    entry('REVERSAL', reversalPostings(chain[0]!.postings), {
      refType: 'LEDGER_TRANSACTION',
      refId: chain[0]!.id,
      metadata: { reversesSeq: 1 },
    }),
  ];
}
const summaryOf = (entries: LedgerEntry[]) => summarizeBalances(computeBalances(chainOf(entries)));
const debt = { kind: 'DEBT' as const, amount: 5_691, feeCharged: 100, ref: 'k1' };

describe('a correction debt repaid by request: the member bears the fee (D22.2)', () => {
  it('clears coverage to the franc with a fee of 100 and an empty general fund', () => {
    expect(summaryOf(broken()).generalFund).toBe(0);
    expect(reservedShortfall(summaryOf(broken()))).toBe(5_591);
    const repaid = [...broken(), pay('M7', [debt])];
    expect(repaid.at(-1)!.postings).toEqual([
      { account: 'cash:provider', amount: 5_591 },
      { account: 'receivable:member:M7', amount: -5_591 },
    ]);
    expect(checkLedger(TEST_GROUP, chainOf(repaid))).toEqual([]);
    expect(reservedShortfall(summaryOf(repaid))).toBe(0);
    expect(summaryOf(repaid).generalFund).toBe(0);
    expect(repaid.at(-1)!.metadata).toMatchObject({
      parts: [{ kind: 'DEBT', amount: 5_691, feeShare: 100, feeCharged: 100 }],
    });
  });

  it('compares with R4.2 for other debts: the fund bears the fee and 100 stays uncovered', () => {
    const plain = [...broken(), pay('M7', [{ kind: 'DEBT', amount: 5_591, ref: 'k1' }])];
    expect(checkLedger(TEST_GROUP, chainOf(plain))).toEqual([]);
    expect(reservedShortfall(summaryOf(plain))).toBe(100);
  });

  it('lets the general fund absorb a provider fee different from the estimate', () => {
    const lower = [...broken(), pay('M7', [debt], 60)];
    expect(lower.at(-1)!.postings).toContainEqual({ account: 'fund:general', amount: -40 });
    expect(checkLedger(TEST_GROUP, chainOf(lower))).toEqual([]);
    const higher = [...broken(), pay('M7', [debt], 130)];
    expect(higher.at(-1)!.postings).toContainEqual({ account: 'fund:general', amount: 30 });
    expect(checkLedger(TEST_GROUP, chainOf(higher))).toEqual([]);
  });

  it('refuses a fee charged on a part that is not a debt, or as large as the part', () => {
    const repay = pay('M7', [debt]);
    const forge = (part: Record<string, number>): LedgerEntry => ({
      ...repay,
      metadata: {
        ...repay.metadata,
        parts: [{ ...(repay.metadata.parts as LedgerEntry['metadata'][])[0], ...part }],
      },
    });
    const at = (e: LedgerEntry) => checkLedger(TEST_GROUP, forgedChainOf([...broken(), e]))[0];
    const seq = broken().length + 1;
    expect(at(forge({ feeCharged: 99 }))).toMatchObject({ seq, code: 'FEE_MISMATCH' });
    expect(at(forge({ feeCharged: 5_691 }))).toMatchObject({ seq, code: 'FEE_MISMATCH' });
    expect(() =>
      paymentReceivedPostings({
        payerMembershipId: 'M7',
        fee: 100,
        feeSource: 'SCHEDULE',
        parts: [{ kind: 'SOLIDARITY', amount: 1_000, feeCharged: 100 }],
      }),
    ).toThrow(RangeError);
  });
});
