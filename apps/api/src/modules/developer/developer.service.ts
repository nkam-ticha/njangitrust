// The developer console's business (D28): read every user and group, delete an account, close a
// group. Deleting and closing go through the account and groups services; this file only loads,
// delegates and audits. Every read is a developer action too, but only changes are audited.
import type {
  DeveloperGroupDetail,
  DeveloperGroupRow,
  DeveloperGroupsQuery,
  DeveloperPage,
  DeveloperUserDetail,
  DeveloperUserRow,
  DeveloperUsersQuery,
} from '@njangi/shared/contracts/developer';
import { clock } from '../../lib/clock';
import { isAppError } from '../../lib/errors';
import { getPrisma, type Prisma } from '../../lib/prisma';
import { deleteAccountAsDeveloper } from '../account';
import { closeAndHideGroup, groupHeldMoney, groupInFlight } from '../groups';
import {
  toDeveloperGroupDetail,
  toDeveloperGroupRow,
  toDeveloperUserDetail,
  toDeveloperUserRow,
  type GroupRowSource,
} from './developer.dto';
import { developerError } from './developer.errors';

const COUNTED = ['INVITED', 'ACTIVE', 'LEAVING'] as const;

/** The account-deletion blockers, restated for the developer (the member's texts speak to the member). */
const DELETE_BLOCKERS = [
  'DELETE_IS_ADMIN',
  'DELETE_IN_RUNNING_CYCLE',
  'DELETE_HAS_OBLIGATIONS',
  'DELETE_OPERATION_IN_PROGRESS',
] as const;
type DeleteBlocker = (typeof DELETE_BLOCKERS)[number];
const isBlocker = (code: string): code is DeleteBlocker =>
  (DELETE_BLOCKERS as readonly string[]).includes(code);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function page<T>(
  items: T[],
  total: number,
  q: { page: number; pageSize: number },
): DeveloperPage<T> {
  return { items, total, page: q.page, pageSize: q.pageSize };
}

/** When each of these people last logged in: the newest new session (a family's first token). */
async function lastLogins(userIds: string[]): Promise<Map<string, Date>> {
  if (userIds.length === 0) return new Map();
  const rows = await getPrisma().refreshToken.groupBy({
    by: ['userId', 'familyId'],
    where: { userId: { in: userIds } },
    _min: { createdAt: true },
  });
  const latest = new Map<string, Date>();
  for (const row of rows) {
    const at = row._min.createdAt;
    if (at && (latest.get(row.userId)?.getTime() ?? 0) < at.getTime()) latest.set(row.userId, at);
  }
  return latest;
}

export async function listUsers(q: DeveloperUsersQuery): Promise<DeveloperPage<DeveloperUserRow>> {
  const digits = (q.q ?? '').replace(/\D/g, '');
  const search: Prisma.UserWhereInput[] = [];
  if (q.q) search.push({ name: { contains: q.q, mode: 'insensitive' } });
  if (digits.length >= 3) search.push({ loginPhone: { contains: digits } });
  const where: Prisma.UserWhereInput = {
    ...(q.status === 'active' ? { deletedAt: null } : {}),
    ...(q.status === 'deleted' ? { deletedAt: { not: null } } : {}),
    ...(q.q ? { OR: search } : {}),
  };
  const prisma = getPrisma();
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        name: true,
        loginPhone: true,
        language: true,
        createdAt: true,
        deletedAt: true,
        _count: { select: { memberships: { where: { status: { in: [...COUNTED] } } } } },
      },
    }),
  ]);
  const logins = await lastLogins(users.map((u) => u.id));
  return page(
    users.map(({ _count, ...u }) =>
      toDeveloperUserRow({
        ...u,
        lastLoginAt: logins.get(u.id) ?? null,
        groupCount: _count.memberships,
      }),
    ),
    total,
    q,
  );
}

export async function getUser(id: string): Promise<DeveloperUserDetail> {
  if (!UUID.test(id)) throw developerError('USER_NOT_FOUND');
  const user = await getPrisma().user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      loginPhone: true,
      language: true,
      createdAt: true,
      deletedAt: true,
      consentVersion: true,
      consentAt: true,
      pinChangedAt: true,
      paymentNumbers: {
        orderBy: { activeFrom: 'desc' },
        select: { number: true, operator: true, activeFrom: true, activeTo: true },
      },
      devices: {
        orderBy: { lastSeenAt: 'desc' },
        select: {
          id: true,
          platform: true,
          createdAt: true,
          lastSeenAt: true,
          revokedAt: true,
          expoPushToken: true,
        },
      },
      refreshTokens: {
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          familyId: true,
          client: true,
          createdAt: true,
          usedAt: true,
          revokedAt: true,
          expiresAt: true,
        },
      },
      memberships: {
        orderBy: { createdAt: 'asc' },
        select: {
          role: true,
          status: true,
          createdAt: true,
          leftAt: true,
          group: { select: { id: true, name: true, status: true, hiddenByDeveloperAt: true } },
        },
      },
    },
  });
  if (!user) throw developerError('USER_NOT_FOUND');
  const now = clock.nowMs();
  const families = new Map<
    string,
    { client: 'MOBILE' | 'WEB'; first: Date; last: Date; open: boolean }
  >();
  for (const token of user.refreshTokens) {
    const live = !token.usedAt && !token.revokedAt && token.expiresAt.getTime() > now;
    const family = families.get(token.familyId);
    if (!family) {
      families.set(token.familyId, {
        client: token.client,
        first: token.createdAt,
        last: token.createdAt,
        open: live,
      });
    } else {
      if (token.createdAt < family.first) family.first = token.createdAt;
      if (token.createdAt > family.last) family.last = token.createdAt;
      family.open = family.open || live;
    }
  }
  const logins = [...families.entries()]
    .map(([sessionId, f]) => ({
      sessionId,
      client: f.client,
      loggedInAt: f.first,
      lastActiveAt: f.last,
      open: f.open,
    }))
    .sort((a, b) => b.loggedInAt.getTime() - a.loggedInAt.getTime());
  return toDeveloperUserDetail({
    id: user.id,
    name: user.name,
    loginPhone: user.loginPhone,
    language: user.language,
    createdAt: user.createdAt,
    deletedAt: user.deletedAt,
    lastLoginAt: logins[0]?.loggedInAt ?? null,
    groupCount: user.memberships.filter((m) => (COUNTED as readonly string[]).includes(m.status))
      .length,
    consentVersion: user.consentVersion,
    consentAt: user.consentAt,
    pinChangedAt: user.pinChangedAt,
    paymentNumbers: user.paymentNumbers,
    devices: user.devices,
    logins,
    memberships: user.memberships.map((m) => ({
      groupId: m.group.id,
      groupName: m.group.name,
      groupStatus: m.group.status,
      groupHiddenAt: m.group.hiddenByDeveloperAt,
      role: m.role,
      status: m.status,
      joinedAt: m.createdAt,
      leftAt: m.leftAt,
    })),
  });
}

/** Deletes an account through the member's own deletion service, without the member's PIN. */
export async function deleteUser(id: string, developer: string): Promise<DeveloperUserDetail> {
  const current = await getUser(id);
  if (current.status === 'DELETED') throw developerError('USER_ALREADY_DELETED');
  try {
    await deleteAccountAsDeveloper(id, developer);
  } catch (error) {
    if (isAppError(error) && isBlocker(error.code)) throw developerError(error.code);
    if (isAppError(error) && error.code === 'ACCOUNT_DELETED') {
      throw developerError('USER_ALREADY_DELETED');
    }
    throw error;
  }
  return getUser(id);
}

type GroupRowRecord = {
  id: string;
  name: string;
  status: GroupRowSource['status'];
  hiddenByDeveloperAt: Date | null;
  createdAt: Date;
  _count: { memberships: number };
  currentCycle: {
    number: number;
    _count: { rounds: number };
    rounds: { number: number; status: 'SCHEDULED' | 'OPEN' | 'PAYOUT' | 'CLOSED' }[];
  } | null;
};

const groupRowSelect = {
  id: true,
  name: true,
  status: true,
  hiddenByDeveloperAt: true,
  createdAt: true,
  _count: { select: { memberships: { where: { status: { in: [...COUNTED] } } } } },
  currentCycle: {
    select: {
      number: true,
      _count: { select: { rounds: true } },
      rounds: {
        where: { status: { not: 'SCHEDULED' } },
        orderBy: { number: 'desc' },
        take: 1,
        select: { number: true, status: true },
      },
    },
  },
} satisfies Prisma.GroupSelect;

function rowSource(g: GroupRowRecord): GroupRowSource {
  return {
    id: g.id,
    name: g.name,
    status: g.status,
    hiddenByDeveloperAt: g.hiddenByDeveloperAt,
    createdAt: g.createdAt,
    memberCount: g._count.memberships,
    cycle: g.currentCycle
      ? {
          number: g.currentCycle.number,
          roundCount: g.currentCycle._count.rounds,
          currentRound: g.currentCycle.rounds[0] ?? null,
        }
      : null,
  };
}

export async function listGroups(
  q: DeveloperGroupsQuery,
): Promise<DeveloperPage<DeveloperGroupRow>> {
  const where: Prisma.GroupWhereInput = {
    ...(q.status !== 'all' ? { status: q.status } : {}),
    ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
  };
  const prisma = getPrisma();
  const [total, groups] = await Promise.all([
    prisma.group.count({ where }),
    prisma.group.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: groupRowSelect,
    }),
  ]);
  return page(
    groups.map((g) => toDeveloperGroupRow(rowSource(g))),
    total,
    q,
  );
}

export async function getGroup(id: string): Promise<DeveloperGroupDetail> {
  if (!UUID.test(id)) throw developerError('GROUP_NOT_FOUND');
  const prisma = getPrisma();
  const group = await prisma.group.findUnique({
    where: { id },
    select: {
      ...groupRowSelect,
      firstPayoutAt: true,
      createdBy: { select: { name: true } },
      memberships: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          status: true,
          user: { select: { id: true, name: true, loginPhone: true, deletedAt: true } },
        },
      },
    },
  });
  if (!group) throw developerError('GROUP_NOT_FOUND');
  const [inFlight, heldMoney] = await Promise.all([
    groupInFlight(prisma, id),
    groupHeldMoney(prisma, id),
  ]);
  return toDeveloperGroupDetail({
    ...rowSource(group),
    firstPayoutAt: group.firstPayoutAt,
    heldMoney,
    createdByName: group.createdBy.name,
    inFlight: {
      openPayments: inFlight.openPayments,
      openDisbursements: inFlight.openDisbursements,
      approvedPayouts: inFlight.approvedPayouts,
      openVotes: inFlight.openVotes,
      pendingActions: inFlight.pendingActions,
    },
    members: group.memberships.map((m) => ({
      membershipId: m.id,
      userId: m.user.id,
      name: m.user.name,
      loginPhone: m.user.loginPhone,
      deletedAt: m.user.deletedAt,
      role: m.role,
      status: m.status,
    })),
  });
}

/** Closes and hides a group (never deletes a ledger row), then returns its new state. */
export async function closeGroup(id: string, developer: string): Promise<DeveloperGroupDetail> {
  await getGroup(id);
  await closeAndHideGroup(id, developer);
  return getGroup(id);
}
