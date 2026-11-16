import { describe, expect, it } from 'vitest';
import { clawbackReleasePostings } from '../ledger/clawback-release';
import { clawbackPostings } from '../ledger/corrections';
import { disbursementRefundedPostings } from '../ledger/disbursement-postings';
import { chainOf, completeOf, entry, sendOf } from '../ledger/ledger.test-support';
import { potAssignedPostings, potCorrectionPostings, reversalPostings } from '../ledger/postings';
import type { LedgerEntry } from '../ledger/types';
import { memberStatementLines } from './member-lines';
import { BENEFICIARY, round4Payment } from './statements.test-support';
import { statementTotals } from './totals';
import type { ObligationFact } from './types';

const ALWAYS = { start: '2000-01-01T00:00:00.000Z', end: '2100-01-01T00:00:00.000Z' };

const linesOf = (
  membershipId: string,
  entries: LedgerEntry[],
  obligations: ObligationFact[] = [],
) =>
  memberStatementLines({
    membershipId,
    transactions: chainOf(entries),
    obligations,
    period: ALWAYS,
  });

const reversalOf = (target: LedgerEntry, seq: number) =>
  entry('REVERSAL', reversalPostings(target.postings), {
    refType: 'LEDGER_TRANSACTION',
    refId: target.id,
    metadata: { reversesSeq: seq },
  });

describe('member statement lines after corrections (2.14, D15, D16, D22)', () => {
  it('shows a payment that was reversed and then applied again as positive lines once more', () => {
    const payment = round4Payment('M3', '2026-10-20T10:00:00.000Z');
    const reversal = reversalOf(payment, 1);
    const entries = [payment, reversal, reversalOf(reversal, 2)];
    const payer = linesOf('M3', entries);
    expect(payer.map((l) => [l.seq, l.amount, l.reversal])).toEqual([
      [1, 10_000, false],
      [1, 1_000, false],
      [2, -10_000, true],
      [2, -1_000, true],
      [3, 10_000, false],
      [3, 1_000, false],
    ]);
    expect(statementTotals(payer)).toMatchObject({
      contributions: 10_000,
      solidarityContributions: 1_000,
    });
    const beneficiary = linesOf(BENEFICIARY, entries);
    expect(statementTotals(beneficiary)).toMatchObject({ payouts: 9_909, payoutFeeShares: 91 });
    expect(beneficiary.at(-1)).toMatchObject({ seq: 3, amount: 9_909, reversal: false });
  });

  it('a refunded loan takes back the loan, its fee and the installments already repaid', () => {
    const sent = sendOf('LOAN', 'M7', 30_000, { interest: 3_000, feeEstimated: 500 });
    const done = completeOf(sent, 500);
    const refund = entry(
      'DISBURSEMENT_REFUNDED',
      disbursementRefundedPostings({
        sent,
        completed: done,
        completedSeq: 2,
        feeKept: 0,
        paidBack: 16_750,
      }),
      { membershipId: 'M7', occurredAt: '2026-12-10T10:00:00.000Z' },
    );
    const installment = (id: string, status: 'PAID' | 'CANCELLED'): ObligationFact => ({
      id,
      membershipId: 'M7',
      kind: 'LOAN_INSTALLMENT',
      amount: 16_750,
      roundId: null,
      roundNumber: null,
      dueAt: '2026-11-21T17:00:00.000Z',
      status,
      paidAt: status === 'PAID' ? '2026-11-20T10:00:00.000Z' : null,
      onTime: status === 'PAID' ? true : null,
    });
    const lines = linesOf(
      'M7',
      [sent, done, refund],
      [installment('i1', 'PAID'), installment('i2', 'CANCELLED')],
    );
    expect(statementTotals(lines)).toMatchObject({
      loans: 0,
      loanInterest: 0,
      fees: 0,
      repayments: 0,
      payouts: 0,
    });
    expect(lines.filter((l) => l.kind === 'INSTALLMENT_REFUND')).toEqual([
      expect.objectContaining({
        category: 'repayments',
        amount: -16_750,
        seq: 3,
        reversal: true,
        at: '2026-12-10T10:00:00.000Z',
      }),
    ]);
  });

  it('a refunded loan without repaid installments adds no repayment line', () => {
    const sent = sendOf('LOAN', 'M7', 30_000, { interest: 3_000, feeEstimated: 500 });
    const done = completeOf(sent, 500);
    const refund = entry(
      'DISBURSEMENT_REFUNDED',
      disbursementRefundedPostings({ sent, completed: done, completedSeq: 2, feeKept: 0 }),
      { membershipId: 'M7' },
    );
    expect(linesOf('M7', [sent, done, refund]).map((l) => l.category)).toEqual([
      'loans',
      'fees',
      'loans',
      'fees',
    ]);
  });

  it('D16.1: money already withdrawn from a reversed payment stays as an advance the member owes', () => {
    const payment = round4Payment('M3', '2026-10-20T10:00:00.000Z');
    const clawback = entry(
      'CLAWBACK',
      clawbackPostings({ debtorMembershipId: BENEFICIARY, from: 'PAYABLE', amount: 9_909 }),
      { membershipId: BENEFICIARY, metadata: { forReversalOfSeq: 1 } },
    );
    const lines = linesOf(BENEFICIARY, [payment, clawback, reversalOf(payment, 1)]);
    expect(lines.map((l) => [l.kind, l.category, l.amount, l.reversal])).toEqual([
      ['ROUND_PAYOUT', 'payouts', 9_909, false],
      ['CLAWBACK', 'payouts', 9_909, false],
      ['ROUND_PAYOUT', 'payouts', -9_909, true],
    ]);
    // What the member really received and kept: 9 909, now owed as a correction debt.
    expect(statementTotals(lines).payouts).toBe(9_909);
    expect(linesOf('M3', [payment, clawback]).some((l) => l.kind === 'CLAWBACK')).toBe(false);
  });

  it('D18.3: a solidarity clawback shows what left the payable, and its release what came back', () => {
    const clawback = entry(
      'CLAWBACK',
      clawbackPostings({
        debtorMembershipId: 'M4',
        from: 'SOLIDARITY_FUND',
        amount: 5_000,
        fromPayable: 2_000,
      }),
      { membershipId: 'M4', metadata: { forReversalOfSeq: 1, solidarityPayoutSeq: 1 } },
    );
    const release = entry(
      'CLAWBACK_RELEASE',
      clawbackReleasePostings({ debtorMembershipId: 'M4', fromDebt: 3_000, toPayable: 2_000 }),
      { membershipId: 'M4', metadata: { clawbackSeq: 1, releasedBySeq: 1 } },
    );
    const taken = linesOf('M4', [clawback]);
    expect(taken.map((l) => [l.kind, l.category, l.amount, l.reversal])).toEqual([
      ['CLAWBACK', 'supportReceived', -2_000, true],
    ]);
    const both = linesOf('M4', [clawback, release]);
    expect(both.map((l) => [l.kind, l.category, l.amount, l.reversal])).toEqual([
      ['CLAWBACK', 'supportReceived', -2_000, true],
      ['CLAWBACK_RELEASE', 'supportReceived', 2_000, false],
    ]);
    expect(statementTotals(both).supportReceived).toBe(0);
    expect(linesOf('M5', [clawback, release])).toEqual([]);
  });

  it('a clawback or a release that does not touch the payable adds no line', () => {
    const clawback = entry(
      'CLAWBACK',
      clawbackPostings({
        debtorMembershipId: 'M4',
        from: 'SOLIDARITY_FUND',
        amount: 5_000,
        fromPayable: 0,
      }),
      { membershipId: 'M4', metadata: { forReversalOfSeq: 1, solidarityPayoutSeq: 1 } },
    );
    const release = entry(
      'CLAWBACK_RELEASE',
      clawbackReleasePostings({ debtorMembershipId: 'M4', fromDebt: 5_000, toPayable: 0 }),
      { membershipId: 'M4', metadata: { clawbackSeq: 1, releasedBySeq: 1 } },
    );
    expect(linesOf('M4', [clawback, release])).toEqual([]);
  });

  it('D15: a pot correction lowers the pot the winner received and shows what they now owe', () => {
    const assigned = entry(
      'POT_ASSIGNED',
      potAssignedPostings({ roundId: 'R4', beneficiaryMembershipId: 'M2', amount: 89_181 }),
    );
    const correction = entry(
      'POT_CORRECTION',
      potCorrectionPostings({
        roundId: 'R4',
        beneficiaryMembershipId: 'M2',
        amount: 9_909,
        winnerPayable: 4_000,
      }),
      { membershipId: 'M2', metadata: { forReversalOfSeq: 1 } },
    );
    const lines = linesOf('M2', [assigned, correction]);
    expect(lines.map((l) => [l.kind, l.amount, l.reversal])).toEqual([
      ['POT', 89_181, false],
      ['POT', -9_909, true],
      ['CLAWBACK', 5_909, false],
    ]);
    // 89 181 won, 9 909 taken back, of which 5 909 were already spent and are now owed.
    expect(statementTotals(lines).payouts).toBe(89_181 - 4_000);
  });

  it('a pot correction fully covered by the payable shows only the corrected pot', () => {
    const correction = entry(
      'POT_CORRECTION',
      potCorrectionPostings({
        roundId: 'R4',
        beneficiaryMembershipId: 'M2',
        amount: 9_909,
        winnerPayable: 20_000,
      }),
      { membershipId: 'M2', metadata: { forReversalOfSeq: 1 } },
    );
    expect(linesOf('M2', [correction]).map((l) => [l.kind, l.amount])).toEqual([['POT', -9_909]]);
  });
});
