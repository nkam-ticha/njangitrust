import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE_SET } from '../ruleset';
import { canPropose, eligibleVoters, PROPOSAL_RULES, proposalWindowHours } from './proposals';

const active = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'];

describe('proposal types (R11.1)', () => {
  it('has the threshold, secrecy and effect of each type', () => {
    expect(PROPOSAL_RULES.RULE_CHANGE).toMatchObject({ threshold: 'TWO_THIRDS', secret: false });
    expect(PROPOSAL_RULES.MEMBER_REMOVE).toMatchObject({
      threshold: 'MAJORITY',
      secret: true,
      excluded: 'TARGET',
    });
    expect(PROPOSAL_RULES.ADMIN_CHANGE).toMatchObject({
      threshold: 'MAJORITY',
      secret: true,
      takesEffect: 'IMMEDIATELY',
    });
    expect(PROPOSAL_RULES.ROTATION_CHANGE).toMatchObject({
      movedMembersMustApprove: true,
      takesEffect: 'NEXT_ROUND',
    });
    expect(PROPOSAL_RULES.EARLY_EXIT).toMatchObject({
      proposer: 'LEAVING_MEMBER',
      excluded: 'REQUESTER',
    });
    expect(PROPOSAL_RULES.ADMIN_LOAN).toMatchObject({
      proposer: 'ADMIN_LOAN_REQUEST',
      excluded: 'ADMIN',
    });
    expect(PROPOSAL_RULES.FINE_WAIVER).toMatchObject({
      excluded: 'FINED_MEMBER',
      takesEffect: 'IMMEDIATELY',
    });
    expect(PROPOSAL_RULES.LEDGER_CORRECTION).toMatchObject({ threshold: 'TWO_THIRDS' });
    expect(PROPOSAL_RULES.SOLIDARITY_PAYOUT).toMatchObject({
      threshold: 'MAJORITY',
      window: 'SOLIDARITY',
    });
  });

  it('counts active members at creation, minus the excluded member (3.1)', () => {
    expect(
      eligibleVoters({
        type: 'RULE_CHANGE',
        activeMembershipIds: active,
        excludedMembershipId: null,
      }),
    ).toHaveLength(10);
    expect(
      eligibleVoters({
        type: 'MEMBER_REMOVE',
        activeMembershipIds: active,
        excludedMembershipId: 'M6',
      }),
    ).toEqual(active.filter((m) => m !== 'M6'));
    expect(() =>
      eligibleVoters({
        type: 'MEMBER_REMOVE',
        activeMembershipIds: active,
        excludedMembershipId: null,
      }),
    ).toThrow(RangeError);
  });

  it('keeps solidarity votes on their own window (R11.3)', () => {
    expect(proposalWindowHours('SOLIDARITY_PAYOUT', DEFAULT_RULE_SET)).toBe(24);
    expect(proposalWindowHours('RULE_CHANGE', DEFAULT_RULE_SET)).toBe(72);
  });

  it('lets any member propose, except early exits (the leaver) and admin loans (created by the request)', () => {
    expect(
      canPropose({ type: 'RULE_CHANGE', proposerMembershipId: 'M1', subjectMembershipId: null }),
    ).toEqual({ ok: true });
    expect(
      canPropose({ type: 'EARLY_EXIT', proposerMembershipId: 'M1', subjectMembershipId: 'M1' }),
    ).toEqual({ ok: true });
    expect(
      canPropose({ type: 'EARLY_EXIT', proposerMembershipId: 'M1', subjectMembershipId: 'M2' }),
    ).toEqual({
      ok: false,
      code: 'ONLY_THE_LEAVING_MEMBER',
    });
    expect(
      canPropose({ type: 'ADMIN_LOAN', proposerMembershipId: 'M1', subjectMembershipId: null }),
    ).toEqual({
      ok: false,
      code: 'CREATED_BY_ADMIN_LOAN_REQUEST',
    });
  });
});
