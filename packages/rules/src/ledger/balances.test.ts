import { describe, expect, it } from 'vitest';
import { computeBalances, summarizeBalances } from './balances';
import { availableForLoans, availableToWithdraw } from './derived';
import {
  fineAssessedPostings,
  loanDisbursedPostings,
  paymentReceivedPostings,
  potAssignedPostings,
} from './postings';

const e1 = paymentReceivedPostings({
  payerMembershipId: 'M3',
  fee: 100,
  parts: [
    { kind: 'CONTRIBUTION', amount: 10_000, creditorMembershipId: 'M7' },
    { kind: 'SOLIDARITY', amount: 1_000 },
  ],
}).postings;

describe('balances from postings (2.5)', () => {
  it('adds up postings per account and reads them the way people do', () => {
    const balances = computeBalances([
      { postings: e1 },
      { postings: fineAssessedPostings({ membershipId: 'M5', amount: 1_000 }) },
    ]);
    expect(balances.get('cash:provider')).toBe(10_900);
    expect(balances.get('payable:member:M7')).toBe(-9_909);
    const summary = summarizeBalances(balances);
    expect(summary).toEqual({
      cash: 10_900,
      generalFund: 1_000,
      solidarityFund: 991,
      payables: 9_909,
      pots: 0,
      receivables: 1_000,
      payableByMember: { M7: 9_909 },
      receivableByMember: { M5: 1_000 },
      potByRound: {},
    });
  });

  it('E2: ten payments of round 4 give M7 99 090 and the solidarity fund 9 910', () => {
    const summary = summarizeBalances(
      computeBalances(Array.from({ length: 10 }, () => ({ postings: e1 }))),
    );
    expect(summary.payableByMember.M7).toBe(99_090);
    expect(summary.solidarityFund).toBe(9_910);
    expect(summary.cash).toBe(109_000);
  });

  it('tracks pots and refuses unknown accounts', () => {
    const balances = computeBalances([
      {
        postings: [
          { account: 'cash:provider', amount: 9_900 },
          { account: 'pot:round:r5', amount: -9_900 },
        ],
      },
      {
        postings: potAssignedPostings({
          roundId: 'r5',
          beneficiaryMembershipId: 'M9',
          amount: 9_900,
        }),
      },
    ]);
    expect(summarizeBalances(balances)).toMatchObject({
      pots: 0,
      potByRound: { r5: 0 },
      payables: 9_900,
    });
    expect(() => summarizeBalances(new Map([['bank:x', 1]]))).toThrow(RangeError);
  });
});

describe('available for loans (2.5 derived value, R5.6)', () => {
  it('is cash minus member payables, pots, the solidarity fund and in-flight disbursements', () => {
    const summary = summarizeBalances(
      computeBalances(Array.from({ length: 10 }, () => ({ postings: e1 }))),
    );
    // 109 000 cash − 99 090 payable − 9 910 solidarity = 0
    expect(availableForLoans({ summary, inFlightDisbursements: 0 })).toBe(0);
    const withFines = summarizeBalances(
      computeBalances([
        {
          postings: [
            { account: 'cash:provider', amount: 40_000 },
            { account: 'receivable:member:M5', amount: -40_000 },
          ],
        },
        { postings: fineAssessedPostings({ membershipId: 'M5', amount: 40_000 }) },
      ]),
    );
    expect(availableForLoans({ summary: withFines, inFlightDisbursements: 5_000 })).toBe(35_000);
    expect(availableForLoans({ summary: withFines, inFlightDisbursements: 50_000 })).toBe(0);
  });

  it('drops after a loan by principal plus actual fee (E3)', () => {
    const summary = summarizeBalances(
      computeBalances([
        {
          postings: [
            { account: 'cash:provider', amount: 40_000 },
            { account: 'fund:general', amount: -40_000 },
          ],
        },
        {
          postings: loanDisbursedPostings({
            membershipId: 'M7',
            principal: 30_000,
            interest: 3_000,
            feeEstimated: 500,
            feeActual: 500,
          }),
        },
      ]),
    );
    expect(availableForLoans({ summary, inFlightDisbursements: 0 })).toBe(9_500);
  });
});

describe('available to withdraw (2.5 derived value, R5.2)', () => {
  const now = new Date('2026-11-28T17:00:00.000Z');

  it('subtracts credits still locked until their payout time, and the estimated fee', () => {
    expect(
      availableToWithdraw({
        payableBalance: 99_090,
        credits: [{ amount: 99_090, payoutAt: new Date('2026-11-28T17:00:00.001Z') }],
        now,
        feeEstimate: 500,
      }),
    ).toEqual({ available: 0, locked: 99_090 });
    // E5: at payoutAt nothing is locked; 81 340 − 500 = 80 840.
    expect(
      availableToWithdraw({
        payableBalance: 81_340,
        credits: [{ amount: 99_090, payoutAt: now }],
        now,
        feeEstimate: 500,
      }),
    ).toEqual({ available: 80_840, locked: 0 });
  });

  it('never locks more than the payable holds and never goes below zero', () => {
    expect(
      availableToWithdraw({
        payableBalance: 5_000,
        credits: [{ amount: 9_909, payoutAt: new Date('2026-12-26T17:00:00.000Z') }],
        now,
        feeEstimate: 500,
      }),
    ).toEqual({ available: 0, locked: 5_000 });
  });
});
