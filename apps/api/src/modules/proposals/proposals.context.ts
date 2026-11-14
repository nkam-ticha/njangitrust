// What every proposal needs to be planned and shown: the group, its voters and member names.
import type { Db } from '../../lib/prisma';
import { authorizeGroup } from '../../permissions';
import { getCurrentParams } from '../rulesets';
import { proposalError } from './proposals.errors';
import type { ActiveMember, PlanContext } from './types';

/** Names of every member who ever joined the group, by membership id. */
export async function memberNames(db: Db, groupId: string): Promise<Map<string, string>> {
  const all = await db.membership.findMany({
    where: { groupId },
    select: { id: true, user: { select: { name: true } } },
  });
  return new Map(all.map((m) => [m.id, m.user.name]));
}

/** 3.1: the members who vote: ACTIVE and LEAVING (R12.2 keeps a leaver's rights). */
export async function activeMembers(db: Db, groupId: string): Promise<ActiveMember[]> {
  const rows = await db.membership.findMany({
    where: { groupId, status: { in: ['ACTIVE', 'LEAVING'] } },
    orderBy: { id: 'asc' },
    select: { id: true, userId: true, role: true, status: true, user: { select: { name: true } } },
  });
  return rows.map((m) => ({
    id: m.id,
    userId: m.userId,
    role: m.role,
    status: m.status as ActiveMember['status'],
    name: m.user.name,
  }));
}

/**
 * Loads and checks the context of a new proposal by `userId`: a participant of a group whose first
 * cycle has started (before it, the admin invites founding members directly, R1.6).
 */
export async function planContext(
  db: Db,
  userId: string,
  groupId: string,
  now: Date,
): Promise<PlanContext> {
  const access = await authorizeGroup(userId, groupId, 'group.proposals.create', db);
  if (access.group.status === 'FORMING') throw proposalError('PROPOSALS_BEFORE_FIRST_CYCLE');
  const [members, names, params] = await Promise.all([
    activeMembers(db, groupId),
    memberNames(db, groupId),
    getCurrentParams(groupId, db),
  ]);
  return {
    db,
    now,
    userId,
    group: access.group,
    proposer: access.membership,
    activeMembers: members,
    names,
    params: params,
  };
}
