// Joining (R1.1, R1.6, R12.1) and announcing a leave at cycle end (R12.2).

import type { Refusal } from '../result';
import { MAX_MEMBERS, MIN_MEMBERS_TO_START } from '../rotation';

/** Spec 2.4 Membership.status. */
export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'LEAVING' | 'LEFT' | 'REMOVED';

/**
 * R1.6, R12.1, R1.1: before the first cycle the admin invites founding members directly; after
 * that, only for a passed MEMBER_ADD. D40.4: between two cycles, while fewer than 3 members will take
 * part in the next one, the admin invites directly again (the group is paused until it has 3). A group
 * never passes 50 members (active, invited or pending).
 */
export function canInvite(input: {
  firstCycleStarted: boolean;
  memberAddPassed: boolean;
  /** Members counted toward the limit: active, leaving and invited. */
  memberCount: number;
  /** D40.4: the group is between two cycles (a cycle closed, the next not started). */
  betweenCycles?: boolean;
  /** D40.4: members who will take part in the next cycle (active and invited, not leaving). */
  participantCount?: number;
}):
  { ok: true } | Refusal<'MEMBER_ADD_VOTE_REQUIRED'> | Refusal<'GROUP_FULL', { maximum: number }> {
  if (input.memberCount >= MAX_MEMBERS)
    return { ok: false, code: 'GROUP_FULL', maximum: MAX_MEMBERS };
  const pausedBetweenCycles =
    input.betweenCycles === true &&
    input.participantCount !== undefined &&
    input.participantCount < MIN_MEMBERS_TO_START;
  if (input.firstCycleStarted && !input.memberAddPassed && !pausedBetweenCycles)
    return { ok: false, code: 'MEMBER_ADD_VOTE_REQUIRED' };
  return { ok: true };
}

/** R1.6, R12.1: founding members are active in cycle 1; later members from the next cycle. */
export function newMemberActiveFromCycle(currentCycleNumber: number | null): number {
  return currentCycleNumber === null ? 1 : currentCycleNumber + 1;
}

/** R12.2: an active member can announce leaving at cycle end; they keep obligations and rights until then. */
export function canAnnounceLeave(
  status: MembershipStatus,
): { ok: true } | Refusal<'ALREADY_LEAVING' | 'NOT_ACTIVE_MEMBER'> {
  if (status === 'LEAVING') return { ok: false, code: 'ALREADY_LEAVING' };
  if (status !== 'ACTIVE') return { ok: false, code: 'NOT_ACTIVE_MEMBER' };
  return { ok: true };
}
