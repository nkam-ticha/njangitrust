// The one function that decides every permission (spec 2.11, CLAUDE.md rule 6). Pure: it reads
// nothing; callers load the actor's membership and the resource first.
import type { GroupActor, GroupStatus, MembershipStatus } from './actor';
import { GROUP_POLICIES, OWNER_ACTIONS, type Action, type Audience, type GroupAction, type OwnerAction } from './policies';

export type Resource =
  | { kind: 'group'; groupId: string; status: GroupStatus }
  | { kind: 'owned'; ownerUserId: string };

export type DenialReason =
  | 'NOT_A_MEMBER'
  | 'MEMBERSHIP_ENDED'
  | 'NOT_ACTIVE_MEMBER'
  | 'ADMIN_ONLY'
  | 'GROUP_CLOSED'
  | 'NOT_OWNER'
  | 'WRONG_RESOURCE';

export type Decision = { allowed: true } | { allowed: false; reason: DenialReason };

const ALLOW: Decision = { allowed: true };
const deny = (reason: DenialReason): Decision => ({ allowed: false, reason });

const READ_STATUSES: ReadonlySet<MembershipStatus> = new Set(['INVITED', 'ACTIVE', 'LEAVING']);
const ACT_STATUSES: ReadonlySet<MembershipStatus> = new Set(['ACTIVE', 'LEAVING']);
const ENDED_STATUSES: ReadonlySet<MembershipStatus> = new Set(['LEFT', 'REMOVED']);

function isOwnerAction(action: Action): action is OwnerAction {
  return (OWNER_ACTIONS as readonly string[]).includes(action);
}

function decideGroup(actor: GroupActor, audience: Audience, groupStatus: GroupStatus): Decision {
  const m = actor.membership;
  if (!m) return deny('NOT_A_MEMBER');
  if (audience === 'anyMember') return ALLOW;
  if (ENDED_STATUSES.has(m.status)) return deny('MEMBERSHIP_ENDED');
  if (audience === 'reader') return READ_STATUSES.has(m.status) ? ALLOW : deny('NOT_ACTIVE_MEMBER');
  if (groupStatus === 'CLOSED') return deny('GROUP_CLOSED');
  if (!ACT_STATUSES.has(m.status)) return deny('NOT_ACTIVE_MEMBER');
  if (audience === 'admin' && m.role !== 'ADMIN') return deny('ADMIN_ONLY');
  return ALLOW;
}

/**
 * `can(actor, action, resource)`: whether `actor` may attempt `action` on `resource`.
 * Group actions need the actor's membership in that group (or null); owner actions need the
 * record's owner.
 */
export function can(actor: GroupActor, action: Action, resource: Resource): Decision {
  if (isOwnerAction(action)) {
    if (resource.kind !== 'owned') return deny('WRONG_RESOURCE');
    return resource.ownerUserId === actor.userId ? ALLOW : deny('NOT_OWNER');
  }
  if (resource.kind !== 'group') return deny('WRONG_RESOURCE');
  return decideGroup(actor, GROUP_POLICIES[action as GroupAction], resource.status);
}
