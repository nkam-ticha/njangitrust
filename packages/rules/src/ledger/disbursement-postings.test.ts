import { describe, expect, it } from 'vitest';
import { computeBalances } from './balances';
import {
  completionType,
  disbursementCompletedPostings,
  disbursementReturnedPostings,
  loanSentPostings,
  solidaritySentPostings,
  withdrawalSentPostings,
} from './disbursement-postings';
import { sumsToZero } from './postings';

const fees = { feeEstimated: 500, feeSource: 'SCHEDULE' as const };

describe('disbursements in flight (D18.1, 2.5, R4.3)', () => {
  it('moves a withdrawal and its estimated fee from the payable to its in-flight account', () => {
    expect(
      withdrawalSentPostings({
        operationId: 'd1',
        membershipId: 'M7',
        amount: 80_840,
        feeEstimated: 500,
      }),
    ).toEqual({
      postings: [
        { account: 'payable:member:M7', amount: 81_340 },
        { account: 'inflight:disbursement:d1', amount: -81_340 },
      ],
      metadata: { purpose: 'WITHDRAWAL', amount: 80_840, feeEstimated: 500, interest: 0 },
    });
  });

  it('books a loan at send: receivable P + I + fee, interest to the fund, P + fee in flight (E3)', () => {
    const sent = loanSentPostings({
      operationId: 'd2',
      membershipId: 'M7',
      principal: 30_000,
      interest: 3_000,
      feeEstimated: 500,
    });
    expect(sent.postings).toEqual([
      { account: 'receivable:member:M7', amount: 33_500 },
      { account: 'fund:general', amount: -3_000 },
      { account: 'inflight:disbursement:d2', amount: -30_500 },
    ]);
    expect(sent.metadata).toEqual({
      purpose: 'LOAN',
      amount: 30_000,
      feeEstimated: 500,
      interest: 3_000,
    });
    // E3: send then completion at the estimated fee net to exactly the spec's postings.
    const done = disbursementCompletedPostings({
      operationId: 'd2',
      amount: 30_000,
      ...fees,
      feeActual: 500,
    });
    const net = computeBalances([sent, done]);
    expect(Object.fromEntries([...net].filter(([, v]) => v !== 0))).toEqual({
      'receivable:member:M7': 33_500,
      'fund:general': -3_000,
      'cash:provider': -30_500,
    });
  });

  it('takes a solidarity payout A from the fund; the recipient receives A − estimated fee', () => {
    const sent = solidaritySentPostings({ operationId: 'd3', amount: 20_000, feeEstimated: 500 });
    expect(sent.postings).toEqual([
      { account: 'fund:solidarity', amount: 20_000 },
      { account: 'inflight:disbursement:d3', amount: -20_000 },
    ]);
    expect(sent.metadata).toEqual({
      purpose: 'SOLIDARITY',
      amount: 19_500,
      feeEstimated: 500,
      interest: 0,
    });
    expect(() =>
      solidaritySentPostings({ operationId: 'd3', amount: 500, feeEstimated: 500 }),
    ).toThrow(RangeError);
  });

  it('completes from the in-flight account; the general fund absorbs the fee difference (R4.3)', () => {
    const args = { operationId: 'd1', amount: 80_840, ...fees };
    expect(disbursementCompletedPostings({ ...args, feeActual: 500 })).toEqual({
      postings: [
        { account: 'inflight:disbursement:d1', amount: 81_340 },
        { account: 'cash:provider', amount: -81_340 },
      ],
      metadata: { feeEstimated: 500, feeActual: 500, feeSource: 'SCHEDULE' },
    });
    expect(disbursementCompletedPostings({ ...args, feeActual: 650 }).postings).toEqual([
      { account: 'inflight:disbursement:d1', amount: 81_340 },
      { account: 'fund:general', amount: 150 },
      { account: 'cash:provider', amount: -81_490 },
    ]);
    const cheaper = disbursementCompletedPostings({ ...args, feeActual: 400 }).postings;
    expect(cheaper).toContainEqual({ account: 'fund:general', amount: -100 });
    expect(sumsToZero(cheaper)).toBe(true);
  });

  it('returns a failed disbursement with the exact negation of its send', () => {
    const sent = withdrawalSentPostings({
      operationId: 'd1',
      membershipId: 'M7',
      amount: 1_000,
      feeEstimated: 500,
    });
    expect(disbursementReturnedPostings(sent.postings)).toEqual([
      { account: 'payable:member:M7', amount: -1_500 },
      { account: 'inflight:disbursement:d1', amount: 1_500 },
    ]);
  });

  it('names the completion type of each purpose', () => {
    expect(completionType('WITHDRAWAL')).toBe('WITHDRAWAL_COMPLETED');
    expect(completionType('LOAN')).toBe('LOAN_DISBURSED');
    expect(completionType('SOLIDARITY')).toBe('SOLIDARITY_DISBURSED');
  });

  it('refuses zero, negative and fractional amounts and fees', () => {
    expect(() =>
      withdrawalSentPostings({
        operationId: 'd1',
        membershipId: 'M7',
        amount: 0,
        feeEstimated: 500,
      }),
    ).toThrow(RangeError);
    expect(() =>
      loanSentPostings({
        operationId: 'd1',
        membershipId: 'M7',
        principal: 10,
        interest: -1,
        feeEstimated: 0,
      }),
    ).toThrow(RangeError);
    expect(() =>
      disbursementCompletedPostings({ operationId: 'd1', amount: 100, ...fees, feeActual: 1.5 }),
    ).toThrow(RangeError);
  });
});
