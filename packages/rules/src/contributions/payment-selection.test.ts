import { describe, expect, it } from 'vitest';
import { preparePayment, proposeRoundToPay, type OpenObligation } from './payment-selection';

const at = (iso: string) => new Date(iso);
const now = at('2026-12-01T09:00:00.000Z');

function ob(
  id: string,
  kind: OpenObligation['kind'],
  amount: number,
  dueAt: string,
  extra: Partial<OpenObligation> = {},
): OpenObligation {
  return {
    id,
    kind,
    membershipId: 'M5',
    amount,
    dueAt: at(dueAt),
    roundId: null,
    roundNumber: null,
    creditorMembershipId: null,
    status: 'DUE',
    inPendingPayment: false,
    ...extra,
  };
}

const round3 = [
  ob('c3', 'CONTRIBUTION', 10_000, '2026-10-30T17:00:00.000Z', {
    roundId: 'r3',
    roundNumber: 3,
    creditorMembershipId: 'M2',
  }),
  ob('s3', 'SOLIDARITY', 1_000, '2026-10-30T17:00:00.000Z', { roundId: 'r3', roundNumber: 3 }),
];
const round4 = [
  ob('c4', 'CONTRIBUTION', 10_000, '2026-11-27T17:00:00.000Z', {
    roundId: 'r4',
    roundNumber: 4,
    creditorMembershipId: 'M7',
  }),
  ob('s4', 'SOLIDARITY', 1_000, '2026-11-27T17:00:00.000Z', { roundId: 'r4', roundNumber: 4 }),
];
const fine4 = ob('f4', 'FINE', 1_000, '2026-11-27T17:00:00.000Z', {
  roundId: 'r4',
  roundNumber: 4,
});
const futureInstallment = ob('i5', 'LOAN_INSTALLMENT', 16_750, '2026-12-25T17:00:00.000Z');

describe('which round to pay first (R3.3)', () => {
  it('proposes the oldest round still owed, with its contribution and solidarity', () => {
    expect(proposeRoundToPay([...round4, ...round3], { now })).toEqual({
      roundId: 'r3',
      roundNumber: 3,
      obligationIds: ['c3', 's3'],
      total: 11_000,
    });
  });

  it('adds due debts when asked, never installments not yet due (R3.6)', () => {
    expect(
      proposeRoundToPay([...round4, fine4, futureInstallment], { now, includeDueDebts: true }),
    ).toEqual({
      roundId: 'r4',
      roundNumber: 4,
      obligationIds: ['c4', 's4', 'f4'],
      total: 12_000,
    });
  });

  it('skips obligations already covered by a pending payment, and returns null when nothing is owed', () => {
    const pending = round3.map((o) => ({ ...o, inPendingPayment: true }));
    expect(proposeRoundToPay([...pending, ...round4], { now })?.roundId).toBe('r4');
    expect(proposeRoundToPay([], { now })).toBeNull();
    expect(proposeRoundToPay([{ ...round4[0]!, status: 'PAID' }], { now })).toBeNull();
  });
});

describe('one payment for several obligations (R3.2, R3.6, spec 2.6)', () => {
  it('turns E4’s contribution, solidarity and fine into payment parts for exactly 12 000', () => {
    expect(preparePayment({ payerMembershipId: 'M5', obligations: [...round4, fine4] })).toEqual({
      ok: true,
      total: 12_000,
      parts: [
        {
          kind: 'CONTRIBUTION',
          amount: 10_000,
          creditorMembershipId: 'M7',
          potRoundId: null,
          tieOrder: 4,
          ref: 'c4',
        },
        {
          kind: 'SOLIDARITY',
          amount: 1_000,
          creditorMembershipId: null,
          potRoundId: null,
          tieOrder: 4,
          ref: 's4',
        },
        {
          kind: 'DEBT',
          amount: 1_000,
          creditorMembershipId: null,
          potRoundId: null,
          tieOrder: 4,
          ref: 'f4',
        },
      ],
    });
  });

  it('sends a bidding round’s contribution to its pot until the beneficiary is known', () => {
    const open = ob('c5', 'CONTRIBUTION', 10_000, '2026-12-24T17:00:00.000Z', {
      roundId: 'r5',
      roundNumber: 5,
    });
    const result = preparePayment({ payerMembershipId: 'M5', obligations: [open] });
    expect(result.ok && result.parts[0]).toMatchObject({
      kind: 'CONTRIBUTION',
      potRoundId: 'r5',
      creditorMembershipId: null,
    });
  });

  it('refuses empty, duplicate, foreign, settled and already pending obligations', () => {
    const pay = (obligations: OpenObligation[]) =>
      preparePayment({ payerMembershipId: 'M5', obligations });
    expect(pay([])).toEqual({ ok: false, code: 'NOTHING_TO_PAY' });
    expect(pay([fine4, fine4])).toEqual({
      ok: false,
      code: 'DUPLICATE_OBLIGATION',
      obligationId: 'f4',
    });
    expect(pay([{ ...fine4, membershipId: 'M6' }])).toEqual({
      ok: false,
      code: 'NOT_YOUR_OBLIGATION',
      obligationId: 'f4',
    });
    expect(pay([{ ...fine4, status: 'PAID' }])).toEqual({
      ok: false,
      code: 'OBLIGATION_NOT_DUE',
      obligationId: 'f4',
      status: 'PAID',
    });
    expect(pay([{ ...fine4, inPendingPayment: true }])).toEqual({
      ok: false,
      code: 'PAYMENT_ALREADY_PENDING',
      obligationId: 'f4',
    });
  });
});
