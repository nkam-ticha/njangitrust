import { describe, expect, it } from 'vitest';
import { paymentReceivedPostings } from './fee-postings';
import { checkLedger } from './invariants';
import {
  chainOf,
  forgedChainOf,
  entry,
  paidOut,
  seedFund,
  sendOf,
  TEST_GROUP,
} from './ledger.test-support';
import {
  autoSettlementPostings,
  fineAssessedPostings,
  potAssignedPostings,
  potCorrectionPostings,
  reversalPostings,
} from './postings';

const payRound4 = (payer: string) =>
  entry(
    'PAYMENT_RECEIVED',
    paymentReceivedPostings({
      payerMembershipId: payer,
      fee: 100,
      feeSource: 'SCHEDULE',
      parts: [
        { kind: 'CONTRIBUTION', amount: 10_000, creditorMembershipId: 'M7' },
        { kind: 'SOLIDARITY', amount: 1_000 },
      ],
    }),
  );

describe('ledger invariants after every transaction (2.5)', () => {
  it('finds nothing wrong in a valid ledger', () => {
    const txs = chainOf([
      payRound4('M3'),
      entry('FINE_ASSESSED', fineAssessedPostings({ membershipId: 'M7', amount: 1_000 })),
      entry('AUTO_SETTLEMENT', autoSettlementPostings({ membershipId: 'M7', amount: 1_000 })),
      ...paidOut('WITHDRAWAL', 'M7', 8_409),
    ]);
    expect(checkLedger(TEST_GROUP, txs)).toEqual([]);
  });

  it('reports a payable going below zero at the exact seq, when the withdrawal is sent (invariant 2)', () => {
    const txs = chainOf([payRound4('M3'), ...paidOut('WITHDRAWAL', 'M7', 9_500)]);
    expect(checkLedger(TEST_GROUP, txs)).toEqual([
      { seq: 2, code: 'NEGATIVE_BALANCE', detail: 'payable:member:M7 is -91' },
    ]);
  });

  it('reports cash and the solidarity fund going below zero (invariants 3 and 4)', () => {
    // No coverage problem is reported: coverage is current state, not integrity (H1). Lending money
    // the group does not have is (RESERVED_LENT, audit 4 H1).
    expect(
      checkLedger(TEST_GROUP, chainOf(paidOut('LOAN', 'M7', 30_000, { interest: 3_000 }))),
    ).toEqual([
      expect.objectContaining({ seq: 1, code: 'RESERVED_LENT' }),
      { seq: 2, code: 'NEGATIVE_BALANCE', detail: 'cash:provider is -30500' },
    ]);
    const problems = checkLedger(
      TEST_GROUP,
      chainOf([payRound4('M3'), ...paidOut('SOLIDARITY', 'M2', 2_000)]),
    );
    expect(problems.map((p) => [p.seq, p.detail])).toEqual([[2, 'fund:solidarity is -1009']]);
  });

  it('accepts an exact REVERSAL once, and refuses a wrong or repeated one', () => {
    const fine = entry(
      'FINE_ASSESSED',
      fineAssessedPostings({ membershipId: 'M5', amount: 1_000 }),
    );
    const reverse = (postings = reversalPostings(fine.postings)) =>
      entry('REVERSAL', postings, {
        refType: 'LEDGER_TRANSACTION',
        refId: fine.id,
        metadata: { reversesSeq: 1 },
      });
    expect(checkLedger(TEST_GROUP, chainOf([fine, reverse()]))).toEqual([]);
    const wrong = reverse([
      { account: 'receivable:member:M5', amount: -900 },
      { account: 'fund:general', amount: 900 },
    ]);
    expect(checkLedger(TEST_GROUP, chainOf([fine, wrong]))[0]).toMatchObject({
      seq: 2,
      code: 'REVERSAL_MISMATCH',
    });
    expect(checkLedger(TEST_GROUP, chainOf([fine, reverse(), reverse()]))[0]).toMatchObject({
      seq: 3,
      code: 'REVERSAL_MISMATCH',
    });
  });

  it('reports duplicate transaction IDs', () => {
    const fine = entry(
      'FINE_ASSESSED',
      fineAssessedPostings({ membershipId: 'M5', amount: 1_000 }),
    );
    expect(checkLedger(TEST_GROUP, chainOf([fine, { ...fine }]))[0]).toMatchObject({
      seq: 2,
      code: 'DUPLICATE_ID',
    });
  });

  it('reports a tampered posting at its seq, before anything later', () => {
    const txs = chainOf([...seedFund(50_000), payRound4('M3'), payRound4('M4')]);
    const tampered = txs.map((t) =>
      t.seq === 3
        ? {
            ...t,
            postings: t.postings.map((p, i) => (i === 0 ? { ...p, amount: p.amount + 1 } : p)),
          }
        : t,
    );
    const problems = checkLedger(TEST_GROUP, tampered);
    expect(problems[0]).toMatchObject({ seq: 3, code: 'HASH_MISMATCH' });
    expect(problems.map((p) => p.code)).toContain('NOT_BALANCED');
  });

  it('flags a receivable below zero (a member credited for a debt they never owed)', () => {
    const fine = entry(
      'FINE_ASSESSED',
      fineAssessedPostings({ membershipId: 'M5', amount: 1_000 }),
    );
    const reverse = () =>
      entry('REVERSAL', reversalPostings(fine.postings), {
        refType: 'LEDGER_TRANSACTION',
        refId: fine.id,
        metadata: { reversesSeq: 1 },
      });
    expect(checkLedger(TEST_GROUP, chainOf([fine, reverse(), reverse()]))).toContainEqual({
      seq: 3,
      code: 'NEGATIVE_BALANCE',
      detail: 'receivable:member:M5 is -1000',
    });
  });
});

describe('bidding pots (D10, R3.4, M3)', () => {
  const payToPot = (payer: string) =>
    entry(
      'PAYMENT_RECEIVED',
      paymentReceivedPostings({
        payerMembershipId: payer,
        fee: 100,
        feeSource: 'SCHEDULE',
        parts: [{ kind: 'CONTRIBUTION', amount: 10_000, potRoundId: 'r5', ref: `c-${payer}` }],
      }),
    );
  const published = (winner = 'M9') =>
    entry('EVENT', [], {
      metadata: {
        event: 'BIDS_PUBLISHED',
        cycleNumber: 1,
        roundNumber: 5,
        roundId: 'r5',
        beneficiaryMembershipId: winner,
        bids: [],
      },
    });
  const assign = (amount: number, winner = 'M9') =>
    entry(
      'POT_ASSIGNED',
      potAssignedPostings({ roundId: 'r5', beneficiaryMembershipId: winner, amount }),
    );

  it('accepts a pot emptied exactly into the recorded winner’s payable', () => {
    expect(
      checkLedger(
        TEST_GROUP,
        chainOf([payToPot('M1'), payToPot('M2'), published(), assign(19_800)]),
      ),
    ).toEqual([]);
  });

  it('refuses an assignment that does not empty the pot, or pays someone else than the winner', () => {
    expect(
      checkLedger(
        TEST_GROUP,
        chainOf([payToPot('M1'), payToPot('M2'), published(), assign(9_900)]),
      )[0],
    ).toMatchObject({ seq: 4, code: 'POT_MISMATCH' });
    expect(
      checkLedger(TEST_GROUP, chainOf([payToPot('M1'), published(), assign(9_900, 'M4')]))[0],
    ).toMatchObject({
      seq: 3,
      code: 'POT_MISMATCH',
      detail: expect.stringContaining('belongs to M9'),
    });
    expect(checkLedger(TEST_GROUP, chainOf([payToPot('M1'), assign(9_900)]))[0]).toMatchObject({
      seq: 2,
      code: 'POT_MISMATCH',
      detail: expect.stringContaining('no bidding result'),
    });
  });

  it('refuses a payment into a pot after its POT_ASSIGNED', () => {
    expect(
      checkLedger(
        TEST_GROUP,
        chainOf([payToPot('M1'), published(), assign(9_900), payToPot('M2')]),
      )[0],
    ).toMatchObject({ seq: 4, code: 'POT_MISMATCH' });
  });

  it('corrects a pot payment reversed after the assignment: POT_CORRECTION, then the exact REVERSAL', () => {
    const payment = payToPot('M1');
    const correction = entry('POT_CORRECTION', {
      postings: potCorrectionPostings({
        roundId: 'r5',
        beneficiaryMembershipId: 'M9',
        amount: 9_900,
        winnerPayable: 19_800,
      }),
      metadata: { forReversalOfSeq: 2 },
    });
    const reversal = entry('REVERSAL', reversalPostings(payment.postings), {
      refType: 'LEDGER_TRANSACTION',
      refId: payment.id,
      metadata: { reversesSeq: 2 },
    });
    const txs = chainOf([
      payToPot('M2'),
      payment,
      published(),
      assign(19_800),
      correction,
      reversal,
    ]);
    expect(checkLedger(TEST_GROUP, txs)).toEqual([]);
    const unfinished = chainOf([
      payToPot('M2'),
      payToPot('M1'),
      published(),
      assign(19_800),
      { ...correction, id: 'x' },
    ]);
    expect(checkLedger(TEST_GROUP, unfinished)).toEqual([
      expect.objectContaining({ seq: 5, code: 'CORRECTION_MISMATCH' }),
      expect.objectContaining({ seq: 5, code: 'POT_MISMATCH' }),
    ]);
  });

  it('accepts the D15 path: the winner already withdrew, so the correction becomes their debt', () => {
    const payment = payToPot('M1');
    const txs = chainOf([
      ...seedFund(20_000),
      payment,
      published(),
      assign(9_900),
      ...paidOut('WITHDRAWAL', 'M9', 9_400),
      entry('POT_CORRECTION', {
        postings: potCorrectionPostings({
          roundId: 'r5',
          beneficiaryMembershipId: 'M9',
          amount: 9_900,
          winnerPayable: 0,
        }),
        metadata: { forReversalOfSeq: 3 },
      }),
      entry('REVERSAL', reversalPostings(payment.postings), {
        refType: 'LEDGER_TRANSACTION',
        refId: payment.id,
        metadata: { reversesSeq: 3 },
      }),
    ]);
    expect(checkLedger(TEST_GROUP, txs)).toEqual([]);
  });

  it('refuses a pot correction that declares money in flight (H2)', () => {
    const payment = payToPot('M1');
    const txs = forgedChainOf([
      payment,
      published(),
      assign(9_900),
      sendOf('WITHDRAWAL', 'M9', 4_000),
      entry('POT_CORRECTION', {
        postings: potCorrectionPostings({
          roundId: 'r5',
          beneficiaryMembershipId: 'M9',
          amount: 9_900,
          winnerPayable: 5_400,
        }),
        metadata: { forReversalOfSeq: 1, inFlightWithdrawal: 4_500 },
      }),
    ]);
    expect(checkLedger(TEST_GROUP, txs)[0]).toMatchObject({
      seq: 5,
      code: 'MALFORMED_TRANSACTION',
    });
  });
});
