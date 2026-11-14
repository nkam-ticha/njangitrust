import { describe, expect, it } from 'vitest';
import { MOCK_FEE_SCHEDULE } from '../fees';
import { computeBalances, summarizeBalances } from './balances';
import { availableForLoans, availableToWithdraw, reservedShortfall } from './derived';
import {
  disbursementCompletedPostings,
  loanSentPostings,
  withdrawalSentPostings,
} from './disbursement-postings';
import { paymentReceivedPostings } from './fee-postings';
import { fineAssessedPostings, potAssignedPostings } from './postings';

const e1 = paymentReceivedPostings({
  payerMembershipId: 'M3',
  fee: 100,
  feeSource: 'SCHEDULE',
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
      inFlight: 0,
      payableByMember: { M7: 9_909 },
      receivableByMember: { M5: 1_000 },
      potByRound: {},
      inFlightByOperation: {},
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
  it('is cash minus member payables, pots, the solidarity fund and payouts in flight', () => {
    const summary = summarizeBalances(
      computeBalances(Array.from({ length: 10 }, () => ({ postings: e1 }))),
    );
    // 109 000 cash − 99 090 payable − 9 910 solidarity = 0
    expect(availableForLoans({ summary })).toBe(0);
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
    expect(availableForLoans({ summary: withFines })).toBe(40_000);
    expect(availableForLoans({ summary: { ...withFines, inFlight: 5_000 } })).toBe(35_000);
    expect(availableForLoans({ summary: { ...withFines, inFlight: 50_000 } })).toBe(0);
  });

  it('drops by principal plus estimated fee when a loan is sent, and stays there (E3, D18.1)', () => {
    const funded = {
      postings: [
        { account: 'cash:provider', amount: 40_000 },
        { account: 'fund:general', amount: -40_000 },
      ],
    };
    const sent = loanSentPostings({
      operationId: 'd1',
      membershipId: 'M7',
      principal: 30_000,
      interest: 3_000,
      feeEstimated: 500,
    });
    const inFlight = summarizeBalances(computeBalances([funded, sent]));
    expect(inFlight).toMatchObject({ inFlight: 30_500, inFlightByOperation: { d1: 30_500 } });
    expect(availableForLoans({ summary: inFlight })).toBe(9_500);
    expect(reservedShortfall(inFlight)).toBe(0);
    const done = disbursementCompletedPostings({
      operationId: 'd1',
      amount: 30_000,
      feeEstimated: 500,
      feeActual: 500,
      feeSource: 'PROVIDER',
    });
    expect(
      availableForLoans({ summary: summarizeBalances(computeBalances([funded, sent, done])) }),
    ).toBe(9_500);
  });

  it('keeps a withdrawal in flight reserved: nothing becomes lendable before it completes', () => {
    const before = Array.from({ length: 10 }, () => ({ postings: e1 }));
    const sent = withdrawalSentPostings({
      operationId: 'w1',
      membershipId: 'M7',
      amount: 50_000,
      feeEstimated: 500,
    });
    const summary = summarizeBalances(computeBalances([...before, sent]));
    expect(summary).toMatchObject({ payables: 48_590, inFlight: 50_500 });
    expect(availableForLoans({ summary })).toBe(0);
    expect(reservedShortfall({ ...summary, cash: summary.cash - 1 })).toBe(1);
  });
});

describe('available to withdraw (2.5 derived value, R5.2, R4.3, D13.3)', () => {
  const now = new Date('2026-11-28T17:00:00.000Z');
  const base = { now, feeSchedule: MOCK_FEE_SCHEDULE, debts: [] };
  const debt = (amount: number) => ({ amount, dueAt: now });

  it('subtracts credits still locked until their payout time, and the estimated fee', () => {
    expect(
      availableToWithdraw({
        ...base,
        payableBalance: 99_090,
        credits: [{ amount: 99_090, payoutAt: new Date('2026-11-28T17:00:00.001Z') }],
      }),
    ).toEqual({
      available: 0,
      spendable: 0,
      locked: 99_090,
      unlocksAt: new Date('2026-11-28T17:00:00.001Z'),
      heldForDebts: 0,
    });
    // E5: at payoutAt nothing is locked; 81 340 − 500 = 80 840.
    expect(
      availableToWithdraw({
        ...base,
        payableBalance: 81_340,
        credits: [{ amount: 99_090, payoutAt: now }],
      }),
    ).toEqual({
      available: 80_840,
      spendable: 81_340,
      locked: 0,
      unlocksAt: null,
      heldForDebts: 0,
    });
  });

  it('never locks more than the payable holds and never goes below zero', () => {
    expect(
      availableToWithdraw({
        ...base,
        payableBalance: 5_000,
        credits: [{ amount: 9_909, payoutAt: new Date('2026-12-26T17:00:00.000Z') }],
      }),
    ).toMatchObject({ available: 0, locked: 5_000 });
  });

  it('holds back every due debt not settled yet (D13.3, M1)', () => {
    expect(
      availableToWithdraw({
        ...base,
        payableBalance: 10_000,
        credits: [],
        debts: [debt(16_750)],
      }),
    ).toEqual({ available: 0, spendable: 0, locked: 0, unlocksAt: null, heldForDebts: 10_000 });
    expect(
      availableToWithdraw({
        ...base,
        payableBalance: 20_000,
        credits: [],
        debts: [debt(1_000), { amount: 5_000, dueAt: new Date('2026-12-26T17:00:00.000Z') }],
      }),
    ).toEqual({
      available: 18_500,
      spendable: 19_000,
      locked: 0,
      unlocksAt: null,
      heldForDebts: 1_000,
    });
  });

  it('refuses credits that are not whole, non-negative francs', () => {
    expect(() =>
      availableToWithdraw({
        ...base,
        payableBalance: 1_000,
        credits: [{ amount: -5, payoutAt: now }],
      }),
    ).toThrow(RangeError);
    expect(() =>
      availableToWithdraw({
        ...base,
        payableBalance: 1_000,
        credits: [{ amount: 1.5, payoutAt: now }],
      }),
    ).toThrow(RangeError);
  });
});
