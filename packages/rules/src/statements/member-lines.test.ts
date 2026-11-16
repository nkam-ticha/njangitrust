import { describe, expect, it } from 'vitest';
import { chainOf, completeOf, entry, refundOf, sendOf } from '../ledger/ledger.test-support';
import { reversalPostings } from '../ledger/postings';
import { memberStatementLines } from './member-lines';
import { statementTotals } from './totals';
import { BENEFICIARY, e5Scenario, round4Payment, T } from './statements.test-support';
import type { StatementPeriod } from './types';

const NOVEMBER: StatementPeriod = {
  start: '2026-10-31T23:00:00.000Z',
  end: '2026-11-30T23:00:00.000Z',
};

const linesOf = (membershipId: string, period = NOVEMBER) => {
  const { transactions, obligations } = e5Scenario();
  return memberStatementLines({ membershipId, transactions, obligations, period });
};

describe('member statement lines (2.14, E1 to E5)', () => {
  it('shows the beneficiary of E5 every figure of the payout breakdown, to the franc', () => {
    const totals = statementTotals(linesOf(BENEFICIARY));
    expect(totals).toEqual({
      contributions: 10_000,
      solidarityContributions: 1_000,
      payouts: 99_090,
      withdrawals: 80_840,
      loans: 30_000,
      repayments: 16_750,
      fines: 1_000,
      bids: 0,
      fees: 1_000,
      supportReceived: 0,
      payoutFeeShares: 910,
      loanInterest: 3_000,
    });
    // E5: payable 99 090 − auto-settlement 17 750 (16 750 + 1 000) − withdrawal 80 840 − fee 500 = 0.
    expect(totals.payouts - totals.repayments - totals.fines - totals.withdrawals - 500).toBe(0);
  });

  it('E1: the payer of one 11 000 payment sees 10 000 + 1 000, on time, for round 4', () => {
    const lines = linesOf('M3');
    expect(lines.map((l) => [l.category, l.amount, l.roundNumber, l.onTime])).toEqual([
      ['contributions', 10_000, 4, true],
      ['solidarityContributions', 1_000, 4, true],
    ]);
    expect(statementTotals(lines).payouts).toBe(0);
  });

  it('marks the late payment of M7 as late', () => {
    const own = linesOf(BENEFICIARY).filter((l) => l.category === 'contributions');
    expect(own.map((l) => [l.at, l.onTime, l.roundNumber])).toEqual([[T.late, false, 4]]);
  });

  it('credits each payment to the beneficiary net of its fee share (E1: 91 of 100 for the contribution)', () => {
    const payouts = linesOf(BENEFICIARY).filter((l) => l.category === 'payouts');
    expect(payouts).toHaveLength(10);
    expect(payouts.every((l) => l.amount === 9_909 && l.feeShare === 91)).toBe(true);
    expect(payouts.every((l) => l.kind === 'ROUND_PAYOUT')).toBe(true);
  });

  it('takes only the lines inside the period (start included, end excluded)', () => {
    const day = { start: '2026-11-28T00:00:00.000Z', end: '2026-11-29T00:00:00.000Z' };
    expect(linesOf(BENEFICIARY, day).map((l) => [l.category, l.amount])).toEqual([
      ['withdrawals', 80_840],
      ['fees', 500],
    ]);
    const exact = { start: T.withdrawal, end: T.withdrawal };
    expect(linesOf(BENEFICIARY, exact)).toEqual([]);
  });

  it('lists lines in time order, then by ledger position', () => {
    const lines = linesOf(BENEFICIARY);
    const times = lines.map((l) => Date.parse(l.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('shows nothing for a member who took no part', () => {
    expect(linesOf('M10').filter((l) => l.category === 'payouts')).toEqual([]);
    expect(linesOf('ABSENT')).toEqual([]);
  });

  it('puts a payment that is later reversed back with negative lines for payer and beneficiary', () => {
    const { transactions } = e5Scenario();
    const original = transactions.find((t) => t.refId === 'pi-M3')!;
    const undone = entry('REVERSAL', reversalPostings(original.postings), {
      refType: 'LEDGER_TRANSACTION',
      refId: original.id,
      metadata: { reversesSeq: original.seq },
      occurredAt: '2026-11-29T09:00:00.000Z',
    });
    const chain = chainOf([...transactions.map(toEntry), undone]);
    const payer = memberStatementLines({
      membershipId: 'M3',
      transactions: chain,
      obligations: [],
      period: NOVEMBER,
    });
    const totals = statementTotals(payer);
    expect(totals.contributions).toBe(0);
    expect(totals.solidarityContributions).toBe(0);
    expect(payer.filter((l) => l.reversal).map((l) => l.amount)).toEqual([-10_000, -1_000]);
    const beneficiary = memberStatementLines({
      membershipId: BENEFICIARY,
      transactions: chain,
      obligations: [],
      period: NOVEMBER,
    });
    expect(statementTotals(beneficiary).payouts).toBe(99_090 - 9_909);
  });

  it('D22.1: a refunded withdrawal is shown as negative lines', () => {
    const sent = sendOf('WITHDRAWAL', 'M2', 5_000, { feeEstimated: 500 });
    const done = completeOf(sent, 500);
    const chain = chainOf([sent, done, refundOf(sent, done, 2, 0)]);
    const lines = memberStatementLines({
      membershipId: 'M2',
      transactions: chain,
      obligations: [],
      period: { start: '2000-01-01T00:00:00.000Z', end: '2100-01-01T00:00:00.000Z' },
    });
    const totals = statementTotals(lines);
    expect(totals.withdrawals).toBe(0);
    expect(totals.fees).toBe(0);
  });

  it('refuses a ledger whose recorded amounts are not whole francs', () => {
    const { transactions } = e5Scenario();
    const forged = transactions.map((t) =>
      t.type === 'WITHDRAWAL_COMPLETED'
        ? { ...t, metadata: { ...t.metadata, feeActual: 500.5 } }
        : t,
    );
    expect(() =>
      memberStatementLines({
        membershipId: BENEFICIARY,
        transactions: forged,
        obligations: [],
        period: NOVEMBER,
      }),
    ).toThrow(RangeError);
  });

  it('shows the support a member received after a solidarity payout (A − estimated fee)', () => {
    const sent = sendOf('SOLIDARITY', 'M4', 5_000, { feeEstimated: 500, feeActual: 600 });
    const chain = chainOf([sent, completeOf(sent, 600)]);
    const lines = memberStatementLines({
      membershipId: 'M4',
      transactions: chain,
      obligations: [],
      period: { start: '2000-01-01T00:00:00.000Z', end: '2100-01-01T00:00:00.000Z' },
    });
    expect(statementTotals(lines).supportReceived).toBe(4_500);
    expect(round4Payment).toBeTypeOf('function');
  });
});

function toEntry(tx: ReturnType<typeof e5Scenario>['transactions'][number]) {
  const { groupId: _g, seq: _s, prevHash: _p, hash: _h, ...rest } = tx;
  return rest;
}
