import { describe, expect, it } from 'vitest';
import { isOnTime, roundObligations } from './obligations';

const dueAt = new Date('2026-11-27T17:00:00.000Z');
const members = ['M1', 'M2', 'M3'];

describe('round obligations (R3.1)', () => {
  it('makes every active member, the beneficiary included, owe the contribution and the solidarity', () => {
    const obligations = roundObligations({
      contributionAmount: 10_000,
      solidarityContribution: 1_000,
      round: { id: 'r4', dueAt, beneficiaryMembershipId: 'M2' },
      activeMembershipIds: members,
    });
    expect(obligations).toHaveLength(6);
    expect(obligations.filter((o) => o.membershipId === 'M2')).toEqual([
      {
        kind: 'CONTRIBUTION',
        membershipId: 'M2',
        amount: 10_000,
        dueAt,
        roundId: 'r4',
        creditorMembershipId: 'M2',
      },
      {
        kind: 'SOLIDARITY',
        membershipId: 'M2',
        amount: 1_000,
        dueAt,
        roundId: 'r4',
        creditorMembershipId: null,
      },
    ]);
  });

  it('creates no solidarity obligation when the solidarity fund is off', () => {
    const obligations = roundObligations({
      contributionAmount: 10_000,
      solidarityContribution: 0,
      round: { id: 'r4', dueAt, beneficiaryMembershipId: 'M2' },
      activeMembershipIds: members,
    });
    expect(obligations.map((o) => o.kind)).toEqual([
      'CONTRIBUTION',
      'CONTRIBUTION',
      'CONTRIBUTION',
    ]);
  });

  it('leaves the creditor empty in bidding mode until the bid closes', () => {
    const [first] = roundObligations({
      contributionAmount: 10_000,
      solidarityContribution: 0,
      round: { id: 'r5', dueAt, beneficiaryMembershipId: null },
      activeMembershipIds: members,
    });
    expect(first).toMatchObject({ kind: 'CONTRIBUTION', creditorMembershipId: null });
  });

  it('refuses duplicate members and amounts that are not whole francs', () => {
    const base = {
      solidarityContribution: 0,
      round: { id: 'r4', dueAt, beneficiaryMembershipId: 'M1' },
    };
    expect(() =>
      roundObligations({ ...base, contributionAmount: 10_000, activeMembershipIds: ['M1', 'M1'] }),
    ).toThrow(RangeError);
    expect(() =>
      roundObligations({ ...base, contributionAmount: 0.5, activeMembershipIds: members }),
    ).toThrow(RangeError);
  });
});

describe('on time (R3.5)', () => {
  it('counts a payment requested before dueAt as on time even if confirmed after', () => {
    expect(
      isOnTime({ intentCreatedAt: new Date('2026-11-27T16:59:59.999Z'), dueAt, succeeded: true }),
    ).toBe(true);
  });

  it('counts a request made at or after dueAt, or a failed one, as late', () => {
    expect(isOnTime({ intentCreatedAt: dueAt, dueAt, succeeded: true })).toBe(false);
    expect(
      isOnTime({ intentCreatedAt: new Date('2026-11-27T10:00:00.000Z'), dueAt, succeeded: false }),
    ).toBe(false);
  });
});
