import { describe, expect, it } from 'vitest';
import { canAnnounceLeave, canInvite, newMemberActiveFromCycle } from './joining';

describe('joining (R1.6, R12.1) and leaving at cycle end (R12.2)', () => {
  it('lets the admin invite founding members directly before the first cycle', () => {
    expect(canInvite({ firstCycleStarted: false, memberAddPassed: false, memberCount: 5 })).toEqual(
      { ok: true },
    );
  });

  it('needs a passed MEMBER_ADD vote once the first cycle has started', () => {
    expect(canInvite({ firstCycleStarted: true, memberAddPassed: false, memberCount: 5 })).toEqual({
      ok: false,
      code: 'MEMBER_ADD_VOTE_REQUIRED',
    });
    expect(canInvite({ firstCycleStarted: true, memberAddPassed: true, memberCount: 5 })).toEqual({
      ok: true,
    });
  });

  it('between cycles, the admin invites directly only while fewer than 3 will take part (D40.4)', () => {
    const between = { firstCycleStarted: true, memberAddPassed: false, memberCount: 5 } as const;
    expect(canInvite({ ...between, betweenCycles: true, participantCount: 2 })).toEqual({
      ok: true,
    });
    expect(canInvite({ ...between, betweenCycles: true, participantCount: 3 })).toEqual({
      ok: false,
      code: 'MEMBER_ADD_VOTE_REQUIRED',
    });
    // Inside a cycle nothing changes, whatever the count.
    expect(canInvite({ ...between, betweenCycles: false, participantCount: 2 })).toEqual({
      ok: false,
      code: 'MEMBER_ADD_VOTE_REQUIRED',
    });
    // The 50-member cap still applies.
    expect(
      canInvite({ ...between, memberCount: 50, betweenCycles: true, participantCount: 2 }),
    ).toMatchObject({ ok: false, code: 'GROUP_FULL' });
  });

  it('never grows a group beyond 50 members (R1.1)', () => {
    expect(
      canInvite({ firstCycleStarted: false, memberAddPassed: false, memberCount: 50 }),
    ).toEqual({
      ok: false,
      code: 'GROUP_FULL',
      maximum: 50,
    });
  });

  it('activates founding members in cycle 1 and later members from the next cycle', () => {
    expect(newMemberActiveFromCycle(null)).toBe(1);
    expect(newMemberActiveFromCycle(2)).toBe(3);
  });

  it('lets only an active member announce leaving at the end of the cycle', () => {
    expect(canAnnounceLeave('ACTIVE')).toEqual({ ok: true });
    expect(canAnnounceLeave('LEAVING')).toEqual({ ok: false, code: 'ALREADY_LEAVING' });
    expect(canAnnounceLeave('LEFT')).toEqual({ ok: false, code: 'NOT_ACTIVE_MEMBER' });
  });
});
