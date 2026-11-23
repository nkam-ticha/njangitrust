// Loads what `can` needs for a group and enforces the decision. Services call this first, so the
// REST routes and the agent's tools get exactly the same checks.
import { getPrisma, type Db } from '../lib/prisma';
import type { GroupActor, GroupStatus, MembershipRef } from './actor';
import { can } from './can';
import { denialToError, permissionError } from './permission-errors';
import type { GroupAction, OwnerAction } from './policies';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GroupAccess {
  group: { id: string; name: string; status: GroupStatus };
  membership: MembershipRef;
  actor: GroupActor;
}

/** The actor's view of a group: the group (or null) and their membership in it (or null). */
export async function loadGroupActor(
  userId: string,
  groupId: string,
  db: Db = getPrisma(),
): Promise<{ group: GroupAccess['group'] | null; actor: GroupActor }> {
  if (!UUID.test(groupId)) return { group: null, actor: { userId, membership: null } };
  const group = await db.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      status: true,
      hiddenByDeveloperAt: true,
      memberships: { where: { userId }, select: { id: true, role: true, status: true }, take: 1 },
    },
  });
  // D28: a group a developer closed and hid does not exist for its members.
  if (!group || group.hiddenByDeveloperAt)
    return { group: null, actor: { userId, membership: null } };
  const { memberships, hiddenByDeveloperAt: _hidden, ...rest } = group;
  return { group: rest, actor: { userId, membership: memberships[0] ?? null } };
}

/**
 * D28: takes the group's row lock, before any member lock. Money actions that start an operation
 * (a payment, a withdrawal) take it first and then re-check access: a developer closing the group
 * holds it exclusively while counting what is in flight, so an operation is either seen by that
 * count or refused here once the close has committed. `share` lets such actions run side by side;
 * `update` is for those that go on to append to the ledger, which takes the exclusive lock itself
 * (a shared lock held by two of them would deadlock on that upgrade). Lock order: Group, Membership.
 */
export async function lockGroup(
  db: Db,
  groupId: string,
  mode: 'share' | 'update' = 'share',
): Promise<void> {
  if (!UUID.test(groupId)) return;
  if (mode === 'update') {
    await db.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${groupId}::uuid FOR UPDATE`;
  } else {
    await db.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${groupId}::uuid FOR SHARE`;
  }
}

/**
 * Throws the right error unless `userId` may do `action` in `groupId`; returns the group and the
 * actor's membership. A malformed or unknown group id answers "not found".
 */
export async function authorizeGroup(
  userId: string,
  groupId: string,
  action: GroupAction,
  db: Db = getPrisma(),
): Promise<GroupAccess> {
  const { group, actor } = await loadGroupActor(userId, groupId, db);
  if (!group) throw permissionError('GROUP_NOT_FOUND');
  const decision = can(actor, action, { kind: 'group', groupId, status: group.status });
  if (!decision.allowed) throw denialToError(decision.reason);
  // `can` allows group actions only with a membership.
  return { group, membership: actor.membership!, actor };
}

/** Throws "not found" unless the record belongs to `userId`. */
export function authorizeOwner(userId: string, action: OwnerAction, ownerUserId: string): void {
  const decision = can({ userId, membership: null }, action, { kind: 'owned', ownerUserId });
  if (!decision.allowed) throw denialToError(decision.reason);
}
