import { describe, expect, it } from 'vitest';
import { paymentReceivedPostings, payableAccount, potAccount } from '../ledger';
import { lockedPayoutCredits, type CreditLedgerEntry } from './credits';

const M1 = payableAccount('M1');
const T1 = new Date('2026-12-05T10:00:00.000Z');
const T2 = new Date('2026-12-12T10:00:00.000Z');

function payment(parts: unknown[]): CreditLedgerEntry {
  return { type: 'PAYMENT_RECEIVED', roundId: null, metadata: { parts }, postings: [] };
}

describe('lockedPayoutCredits (R5.2, R4.2)', () => {
  it('credits each paid contribution part net of its fee share, unlocked at its round payout', () => {
    const credits = lockedPayoutCredits({
      payable: M1,
      entries: [
        payment([
          { kind: 'CONTRIBUTION', account: M1, obligationId: 'o1', amount: 5_000, feeShare: 55 },
          { kind: 'CONTRIBUTION', account: M1, obligationId: 'o2', amount: 5_000, feeShare: 54 },
        ]),
      ],
      contributionUnlockAt: new Map([
        ['o1', T1],
        ['o2', T2],
      ]),
      potUnlockAt: new Map(),
    });
    expect(credits).toEqual([
      { amount: 4_945, payoutAt: T1 },
      { amount: 4_946, payoutAt: T2 },
    ]);
  });

  it('agrees with what paymentReceivedPostings credits to the payable', () => {
    const { postings, metadata } = paymentReceivedPostings({
      payerMembershipId: 'M9',
      fee: 109,
      feeSource: 'SCHEDULE',
      parts: [
        { kind: 'CONTRIBUTION', amount: 5_000, ref: 'o1', creditorMembershipId: 'M1' },
        { kind: 'CONTRIBUTION', amount: 5_000, ref: 'o2', creditorMembershipId: 'M1' },
      ],
    });
    const posted = -postings.filter((p) => p.account === M1).reduce((s, p) => s + p.amount, 0);
    const credits = lockedPayoutCredits({
      payable: M1,
      entries: [{ type: 'PAYMENT_RECEIVED', roundId: null, metadata, postings }],
      contributionUnlockAt: new Map([
        ['o1', T1],
        ['o2', T1],
      ]),
      potUnlockAt: new Map(),
    });
    expect(credits.reduce((s, c) => s + c.amount, 0)).toBe(posted);
  });

  it('skips parts of another kind or account, unknown obligations and unsafe figures', () => {
    const credits = lockedPayoutCredits({
      payable: M1,
      entries: [
        payment([
          {
            kind: 'SOLIDARITY',
            account: 'fund:solidarity',
            obligationId: 'o1',
            amount: 100,
            feeShare: 1,
          },
          {
            kind: 'CONTRIBUTION',
            account: payableAccount('M2'),
            obligationId: 'o1',
            amount: 100,
            feeShare: 1,
          },
          { kind: 'CONTRIBUTION', account: M1, obligationId: 'unknown', amount: 100, feeShare: 1 },
          { kind: 'CONTRIBUTION', account: M1, obligationId: 'o1', amount: 100.5, feeShare: 1 },
          { kind: 'CONTRIBUTION', account: M1, obligationId: 'o1', amount: 100, feeShare: '1' },
          { kind: 'CONTRIBUTION', account: M1, obligationId: 7, amount: 100, feeShare: 1 },
          null,
          'text',
        ]),
        { type: 'PAYMENT_RECEIVED', roundId: null, metadata: {}, postings: [] },
        { type: 'PAYMENT_RECEIVED', roundId: null, metadata: null, postings: [] },
        { type: 'EVENT', roundId: null, metadata: { parts: [] }, postings: [] },
      ],
      contributionUnlockAt: new Map([['o1', T1]]),
      potUnlockAt: new Map(),
    });
    expect(credits).toEqual([]);
  });

  it('never credits a negative amount when a fee share exceeds its part', () => {
    const credits = lockedPayoutCredits({
      payable: M1,
      entries: [
        payment([
          { kind: 'CONTRIBUTION', account: M1, obligationId: 'o1', amount: 10, feeShare: 30 },
        ]),
      ],
      contributionUnlockAt: new Map([['o1', T1]]),
      potUnlockAt: new Map(),
    });
    expect(credits).toEqual([{ amount: 0, payoutAt: T1 }]);
  });

  it('credits an assigned pot (POT_ASSIGNED) to the payable, unlocked at its round payout', () => {
    const credits = lockedPayoutCredits({
      payable: M1,
      entries: [
        {
          type: 'POT_ASSIGNED',
          roundId: 'r1',
          metadata: {},
          postings: [
            { account: potAccount('r1'), amount: 9_000 },
            { account: M1, amount: -9_000 },
          ],
        },
        {
          type: 'POT_ASSIGNED',
          roundId: 'r-other',
          metadata: {},
          postings: [{ account: M1, amount: -1_000 }],
        },
        {
          type: 'POT_ASSIGNED',
          roundId: null,
          metadata: {},
          postings: [{ account: M1, amount: -5 }],
        },
        {
          type: 'POT_CORRECTION',
          roundId: 'r1',
          metadata: {},
          postings: [{ account: M1, amount: -50 }],
        },
      ],
      contributionUnlockAt: new Map(),
      potUnlockAt: new Map([['r1', T2]]),
    });
    expect(credits).toEqual([{ amount: 9_000, payoutAt: T2 }]);
  });

  it('lists contribution credits first, then pot credits, each in ledger order', () => {
    const credits = lockedPayoutCredits({
      payable: M1,
      entries: [
        {
          type: 'POT_ASSIGNED',
          roundId: 'r1',
          metadata: {},
          postings: [{ account: M1, amount: -700 }],
        },
        payment([
          { kind: 'CONTRIBUTION', account: M1, obligationId: 'o1', amount: 200, feeShare: 2 },
        ]),
      ],
      contributionUnlockAt: new Map([['o1', T1]]),
      potUnlockAt: new Map([['r1', T2]]),
    });
    expect(credits).toEqual([
      { amount: 198, payoutAt: T1 },
      { amount: 700, payoutAt: T2 },
    ]);
  });
});
