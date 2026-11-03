// Groups (spec 2.7 Groups, R1.1, R1.6, 3.2). The creator becomes the admin; the first rule set
// is version 1, built and validated by @njangi/rules.
import type { CreateGroupRequest } from '@njangi/shared/contracts/groups';
import { groupTexts } from '@njangi/shared/i18n/server/groups';
import { AfterCommit } from '../../lib/after-commit';
import { clock } from '../../lib/clock';
import { getPrisma, withTransaction, type Db } from '../../lib/prisma';
import { bilingual } from '../../lib/texts';
import { authorizeGroup, type MembershipRef } from '../../permissions';
import type { GroupSource } from '../../dto';
import { audit } from '../audit';
import { postSystemMessage } from '../chat';
import { buildInitialRuleSet, createRuleSetVersion, getCurrentRuleSet, rulesetError } from '../rulesets';

/** Members counted in a group: those who read it (INVITED, ACTIVE, LEAVING). */
export const COUNTED_STATUSES = ['INVITED', 'ACTIVE', 'LEAVING'] as const;

export function countMembers(groupId: string, db: Db = getPrisma()): Promise<number> {
  return db.membership.count({ where: { groupId, status: { in: [...COUNTED_STATUSES] } } });
}

export interface GroupWithMe {
  group: GroupSource;
  membership: MembershipRef;
  memberCount: number;
}

export async function createGroup(userId: string, input: CreateGroupRequest): Promise<GroupWithMe> {
  const firstPayoutAt = new Date(input.firstPayoutAt);
  if (firstPayoutAt.getTime() <= clock.nowMs()) throw rulesetError('FIRST_PAYOUT_IN_PAST');
  const params = buildInitialRuleSet({
    firstPayoutAt,
    ...(input.monthlyAnchor ? { monthlyAnchor: input.monthlyAnchor } : {}),
    ...(input.rules ? { rules: input.rules } : {}),
  });
  const effects = new AfterCommit();
  const created = await withTransaction(async (tx) => {
    const creator = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
    const group = await tx.group.create({
      data: { name: input.name, status: 'FORMING', createdByUserId: userId, firstPayoutAt },
    });
    const membership = await tx.membership.create({
      data: { groupId: group.id, userId, role: 'ADMIN', status: 'ACTIVE', activeFromCycle: 1 },
      select: { id: true, role: true, status: true },
    });
    await createRuleSetVersion(tx, { groupId: group.id, version: 1, params });
    await postSystemMessage(group.id, bilingual(groupTexts.groupCreated, { name: creator.name }), effects, tx);
    await audit({ action: 'group.created', actorUserId: userId, groupId: group.id, target: `Group:${group.id}` }, tx);
    return { group, membership };
  });
  await effects.run();
  return { ...created, memberCount: 1 };
}

export interface GroupOverview extends GroupWithMe {
  rulesVersion: number;
}

export async function getGroupOverview(userId: string, groupId: string): Promise<GroupOverview> {
  const access = await authorizeGroup(userId, groupId, 'group.read');
  const prisma = getPrisma();
  const [group, memberCount, ruleSet] = await Promise.all([
    prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { id: true, name: true, status: true, firstPayoutAt: true, createdAt: true },
    }),
    countMembers(groupId),
    getCurrentRuleSet(groupId),
  ]);
  return { group, membership: access.membership, memberCount, rulesVersion: ruleSet.version };
}
