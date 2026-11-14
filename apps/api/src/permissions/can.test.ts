import { describe, expect, it } from 'vitest';
import type { MembershipRef } from './actor';
import { can } from './can';

const group = { kind: 'group', groupId: 'g', status: 'ACTIVE' } as const;
const base: MembershipRef = { id: 'm', role: 'MEMBER', status: 'ACTIVE' };
const as = (membership: Partial<MembershipRef> | null) => ({
  userId: 'u',
  membership: membership ? { ...base, ...membership } : null,
});

describe('can(actor, action, resource) (spec 2.11)', () => {
  it('lets members read and act, and only the admin do admin actions (R1.2)', () => {
    expect(can(as({}), 'group.ledger.read', group)).toEqual({ allowed: true });
    expect(can(as({}), 'group.proposals.create', group)).toEqual({ allowed: true });
    expect(can(as({}), 'group.invites.create', group)).toEqual({
      allowed: false,
      reason: 'ADMIN_ONLY',
    });
    expect(can(as({ role: 'ADMIN' }), 'group.invites.create', group)).toEqual({ allowed: true });
  });

  it('treats a non-member as a stranger', () => {
    expect(can(as(null), 'group.read', group)).toEqual({ allowed: false, reason: 'NOT_A_MEMBER' });
    expect(can(as(null), 'group.withdrawals.create', group)).toEqual({
      allowed: false,
      reason: 'NOT_A_MEMBER',
    });
  });

  it('lets a member who joined after the first cycle read but not act yet (R12.1)', () => {
    expect(can(as({ status: 'INVITED' }), 'group.chat.read', group)).toEqual({ allowed: true });
    expect(can(as({ status: 'INVITED' }), 'group.votes.cast', group)).toEqual({
      allowed: false,
      reason: 'NOT_ACTIVE_MEMBER',
    });
  });

  it('keeps a leaving member’s rights until the cycle ends (R12.2)', () => {
    expect(can(as({ status: 'LEAVING' }), 'group.payments.create', group)).toEqual({
      allowed: true,
    });
  });

  it('leaves a former member only statements and withdrawals of money owed (R12.4)', () => {
    for (const status of ['LEFT', 'REMOVED'] as const) {
      expect(can(as({ status }), 'group.read', group)).toEqual({
        allowed: false,
        reason: 'MEMBERSHIP_ENDED',
      });
      expect(can(as({ status, role: 'ADMIN' }), 'group.invites.create', group)).toEqual({
        allowed: false,
        reason: 'MEMBERSHIP_ENDED',
      });
      expect(can(as({ status }), 'group.statements.own', group)).toEqual({ allowed: true });
    }
  });

  it('allows reading but no action in a closed group', () => {
    const closed = { ...group, status: 'CLOSED' } as const;
    expect(can(as({}), 'group.ledger.read', closed)).toEqual({ allowed: true });
    expect(can(as({}), 'group.chat.post', closed)).toEqual({
      allowed: false,
      reason: 'GROUP_CLOSED',
    });
  });

  it('gives owner actions only to the owner, whatever their role', () => {
    const own = { kind: 'owned', ownerUserId: 'u' } as const;
    const other = { kind: 'owned', ownerUserId: 'someone-else' } as const;
    expect(can(as(null), 'pendingAction.confirm', own)).toEqual({ allowed: true });
    expect(can(as({ role: 'ADMIN' }), 'pendingAction.confirm', other)).toEqual({
      allowed: false,
      reason: 'NOT_OWNER',
    });
    expect(can(as(null), 'agent.history.read', other)).toEqual({
      allowed: false,
      reason: 'NOT_OWNER',
    });
  });

  it('refuses an action checked against the wrong kind of resource', () => {
    expect(can(as({}), 'pendingAction.read', group)).toEqual({
      allowed: false,
      reason: 'WRONG_RESOURCE',
    });
    expect(can(as({}), 'group.read', { kind: 'owned', ownerUserId: 'u' })).toEqual({
      allowed: false,
      reason: 'WRONG_RESOURCE',
    });
  });
});
