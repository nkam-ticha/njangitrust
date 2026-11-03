// The member's own account (spec 2.7 Me). Every function acts on the authenticated user only.
import type { UpdateMeRequest } from '@njangi/shared/contracts/me';
import { getPrisma, type Db } from '../../lib/prisma';
import type { SelfSource } from '../../dto';
import { commonError } from '../../lib/errors';
import { audit } from '../audit';

const ACTIVE_MEMBER_STATUSES = ['INVITED', 'ACTIVE', 'LEAVING'] as const;

/** The data `toSelf` needs: the user and their active payment number. */
export async function getSelfSource(userId: string, db: Db = getPrisma()): Promise<SelfSource> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      loginPhone: true,
      language: true,
      consentVersion: true,
      consentAt: true,
      createdAt: true,
      deletedAt: true,
      paymentNumbers: {
        where: { activeTo: null },
        select: { number: true, operator: true, activeFrom: true },
        take: 1,
      },
    },
  });
  if (!user || user.deletedAt) throw commonError('UNAUTHENTICATED');
  const { paymentNumbers, deletedAt: _deleted, ...rest } = user;
  return { user: rest, paymentNumber: paymentNumbers[0] ?? null };
}

export async function updateMe(userId: string, input: UpdateMeRequest): Promise<SelfSource> {
  await getPrisma().user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
    },
  });
  if (input.name !== undefined) {
    await audit({ action: 'user.name.changed', actorUserId: userId, target: `User:${userId}` });
  }
  return getSelfSource(userId);
}

export interface MyGroupSource {
  group: { id: string; name: string; status: 'FORMING' | 'ACTIVE' | 'CLOSED' };
  membership: { id: string; role: 'ADMIN' | 'MEMBER'; status: 'INVITED' | 'ACTIVE' | 'LEAVING' | 'LEFT' | 'REMOVED' };
  memberCount: number;
}

/** Every group the member belongs to or belonged to (R12.4 keeps statements of past groups). */
export async function listMyGroups(userId: string): Promise<MyGroupSource[]> {
  const memberships = await getPrisma().membership.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      status: true,
      group: {
        select: {
          id: true,
          name: true,
          status: true,
          _count: { select: { memberships: { where: { status: { in: [...ACTIVE_MEMBER_STATUSES] } } } } },
        },
      },
    },
  });
  return memberships.map(({ group, ...membership }) => ({
    group: { id: group.id, name: group.name, status: group.status },
    membership,
    memberCount: group._count.memberships,
  }));
}

/**
 * Inputs of the withdrawal hold (R13.5, R5.5, spec 2.10) for @njangi/rules `activeHold`: when the
 * payment number last changed (null for the first number) and when the PIN was last reset.
 */
export async function securityHoldSources(
  userId: string,
  db: Db = getPrisma(),
): Promise<{ numberChangedAt: Date | null; pinResetAt: Date | null }> {
  const [user, numbers] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { pinResetAt: true } }),
    db.paymentNumber.findMany({
      where: { userId },
      orderBy: { activeFrom: 'desc' },
      take: 2,
      select: { activeFrom: true, activeTo: true },
    }),
  ]);
  const current = numbers.find((n) => n.activeTo === null);
  const numberChangedAt = current && numbers.length > 1 ? current.activeFrom : null;
  return { numberChangedAt, pinResetAt: user.pinResetAt };
}
