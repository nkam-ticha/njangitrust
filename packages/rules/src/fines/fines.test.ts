import { describe, expect, it } from 'vitest';
import { absenceFines, installmentFine, roundLateFines } from './fines';

const dueAt = new Date('2026-11-27T17:00:00.000Z');
const due = { status: 'DUE' as const, onTimeIntentInProgress: false };
const paid = { status: 'PAID' as const, onTimeIntentInProgress: false };

describe('late fines at dueAt (R6.1)', () => {
  it('fines each member once per round, however many obligations are late (E4)', () => {
    expect(
      roundLateFines({
        lateFine: 1_000,
        members: [
          {
            membershipId: 'M5',
            obligations: [
              { kind: 'CONTRIBUTION', ...due },
              { kind: 'SOLIDARITY', ...due },
            ],
          },
          {
            membershipId: 'M6',
            obligations: [
              { kind: 'CONTRIBUTION', ...paid },
              { kind: 'SOLIDARITY', ...due },
            ],
          },
          {
            membershipId: 'M7',
            obligations: [
              { kind: 'CONTRIBUTION', ...paid },
              { kind: 'SOLIDARITY', ...paid },
            ],
          },
        ],
      }),
    ).toEqual([
      { membershipId: 'M5', amount: 1_000 },
      { membershipId: 'M6', amount: 1_000 },
    ]);
  });

  it('does not fine a payment requested before dueAt that is still in progress (R3.5)', () => {
    expect(
      roundLateFines({
        lateFine: 1_000,
        members: [
          {
            membershipId: 'M5',
            obligations: [{ kind: 'CONTRIBUTION', status: 'DUE', onTimeIntentInProgress: true }],
          },
        ],
      }),
    ).toEqual([]);
  });

  it('fines nobody when lateFine is 0', () => {
    expect(
      roundLateFines({
        lateFine: 0,
        members: [{ membershipId: 'M5', obligations: [{ kind: 'CONTRIBUTION', ...due }] }],
      }),
    ).toEqual([]);
  });
});

describe('installment fines (R6.2)', () => {
  const installment = { id: 'i1', amount: 16_750, dueAt, ...due };
  const ownFine = { id: 'f1', kind: 'FINE' as const, amount: 1_000, dueAt };

  it('E5: no fine when the borrower is the beneficiary and the locked payout covers it', () => {
    expect(
      installmentFine({
        lateFine: 1_000,
        installment,
        borrowerIsRoundBeneficiary: true,
        lockedPayout: 89_181, // nine of ten contributions in at dueAt
        otherDueDebts: [ownFine],
      }),
    ).toEqual({ fined: false, reason: 'COVERED_BY_LOCKED_PAYOUT' });
  });

  it('fines when the borrower is not the beneficiary, or the locked payout falls short', () => {
    const args = { lateFine: 1_000, installment, lockedPayout: 89_181, otherDueDebts: [ownFine] };
    expect(installmentFine({ ...args, borrowerIsRoundBeneficiary: false })).toEqual({
      fined: true,
      amount: 1_000,
    });
    expect(
      installmentFine({ ...args, borrowerIsRoundBeneficiary: true, lockedPayout: 17_000 }),
    ).toEqual({
      fined: true,
      amount: 1_000,
    });
  });

  it('does not fine a paid installment, one with an on-time payment in progress, or when fines are off', () => {
    const args = { borrowerIsRoundBeneficiary: false, lockedPayout: 0, otherDueDebts: [] };
    expect(
      installmentFine({ ...args, lateFine: 1_000, installment: { ...installment, ...paid } }),
    ).toEqual({
      fined: false,
      reason: 'PAID',
    });
    expect(
      installmentFine({
        ...args,
        lateFine: 1_000,
        installment: { ...installment, onTimeIntentInProgress: true },
      }),
    ).toEqual({ fined: false, reason: 'PAYMENT_IN_PROGRESS' });
    expect(installmentFine({ ...args, lateFine: 0, installment })).toEqual({
      fined: false,
      reason: 'FINES_OFF',
    });
  });
});

describe('absence fines (R6.3)', () => {
  const startsAt = new Date('2026-11-28T15:00:00.000Z');

  it('fines members marked absent without an excuse sent before the start', () => {
    expect(
      absenceFines({
        meetingAbsenceFine: 500,
        startsAt,
        attendance: [
          { membershipId: 'M1', present: true, excuseSentAt: null },
          { membershipId: 'M2', present: false, excuseSentAt: null },
          {
            membershipId: 'M3',
            present: false,
            excuseSentAt: new Date('2026-11-28T14:00:00.000Z'),
          },
          { membershipId: 'M4', present: false, excuseSentAt: startsAt },
        ],
      }),
    ).toEqual([
      { membershipId: 'M2', amount: 500 },
      { membershipId: 'M4', amount: 500 },
    ]);
  });

  it('fines nobody while meetingAbsenceFine is 0 (the default)', () => {
    expect(
      absenceFines({
        meetingAbsenceFine: 0,
        startsAt,
        attendance: [{ membershipId: 'M2', present: false, excuseSentAt: null }],
      }),
    ).toEqual([]);
  });
});
