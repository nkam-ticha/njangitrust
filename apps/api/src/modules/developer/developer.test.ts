// The developer console (D28): its own login, token isolation in both directions, the user and
// group reads (the only responses with full phone numbers), account deletion through the member's
// own service, and closing a group without touching a ledger row.
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { verifyChain } from '@njangi/rules';
import { getEnv, resetEnvCache } from '../../config/env';
import { getPrisma } from '../../lib/prisma';
import { api } from '../../../test/helpers/client';
import { testApp } from '../../../test/helpers/app';
import { addMember, createGroup, signUp } from '../../../test/helpers/factories';
import { propose, startedGroup } from '../../../test/helpers/governance';
import { hashPin } from '../auth';
import { readChain } from '../statements';
import { signDeveloperToken } from './developer.auth';
import { developerLoginByAddress, developerLoginInTotal } from './developer.login';

const USERNAME = 'owner-console';
const PASSWORD = 'a long developer password 2026';
const JWT_SECRET = 'developer-token-secret-for-tests-0123456789';

const dev = (token?: string) => {
  const agent = (method: 'get' | 'post' | 'delete', path: string) => {
    const req = request(testApp())[method](path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  return {
    get: (path: string) => agent('get', path),
    post: (path: string, body?: object) => agent('post', path).send(body ?? {}),
    delete: (path: string) => agent('delete', path),
  };
};

async function login(password = PASSWORD, username = USERNAME) {
  return request(testApp()).post('/v1/developer/login').send({ username, password });
}

async function developerToken(): Promise<string> {
  const res = await login();
  expect(res.status).toBe(200);
  return res.body.session.token as string;
}

const prisma = () => getPrisma();
const auditOf = (action: string) =>
  prisma().auditLog.findMany({ where: { action }, orderBy: { createdAt: 'desc' } });

beforeAll(async () => {
  process.env.DEVELOPER_USERNAME = USERNAME;
  process.env.DEVELOPER_PASSWORD_HASH = await hashPin(PASSWORD);
  process.env.DEVELOPER_JWT_SECRET = JWT_SECRET;
  resetEnvCache();
});

afterAll(() => {
  delete process.env.DEVELOPER_USERNAME;
  delete process.env.DEVELOPER_PASSWORD_HASH;
  delete process.env.DEVELOPER_JWT_SECRET;
  resetEnvCache();
});

beforeEach(() => {
  developerLoginByAddress.resetAllForTests();
  developerLoginInTotal.resetAllForTests();
});

describe('the developer login', () => {
  it('opens a short, non-renewable session with the right credentials', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    const { token, expiresAt } = res.body.session as { token: string; expiresAt: string };
    expect(token.split('.')).toHaveLength(3);
    const minutes = (new Date(expiresAt).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(28);
    expect(minutes).toBeLessThanOrEqual(30);
    // No refresh token, no cookie: when the token ends, the developer logs in again.
    expect(res.body.session.refreshToken).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
    expect((await auditOf('developer.login.succeeded')).length).toBeGreaterThan(0);
  });

  it('answers the same for a wrong username and a wrong password, and audits the failure', async () => {
    const before = (await auditOf('developer.login.failed')).length;
    const wrongPassword = await login('not the password at all');
    const wrongName = await login(PASSWORD, 'someone-else');
    for (const res of [wrongPassword, wrongName]) {
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('DEVELOPER_LOGIN_INVALID');
      expect(res.body.messageFr).toBeTruthy();
      expect(res.body.messageEn).toBeTruthy();
    }
    expect(wrongName.body).toEqual(wrongPassword.body);
    const failures = await auditOf('developer.login.failed');
    expect(failures.length).toBe(before + 2);
    // Neither the password nor the typed username reaches the audit log.
    expect(JSON.stringify(failures[0])).not.toContain('not the password');
    expect(JSON.stringify(failures[0])).not.toContain('someone-else');
  });

  it('locks the address after five failures, even for the right password', async () => {
    for (let i = 0; i < 5; i += 1) expect((await login('wrong password here')).status).toBe(401);
    const locked = await login();
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('DEVELOPER_LOCKED');
    expect((await auditOf('developer.login.locked')).length).toBeGreaterThan(0);
  });

  it('refuses the body fields it does not know', async () => {
    const res = await request(testApp())
      .post('/v1/developer/login')
      .send({ username: USERNAME, password: PASSWORD, admin: true });
    expect(res.status).toBe(400);
  });

  it('is closed when no developer credentials are configured', async () => {
    const saved = {
      name: process.env.DEVELOPER_USERNAME,
      hash: process.env.DEVELOPER_PASSWORD_HASH,
    };
    delete process.env.DEVELOPER_USERNAME;
    delete process.env.DEVELOPER_PASSWORD_HASH;
    resetEnvCache();
    try {
      const res = await login();
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('DEVELOPER_LOGIN_INVALID');
    } finally {
      process.env.DEVELOPER_USERNAME = saved.name;
      process.env.DEVELOPER_PASSWORD_HASH = saved.hash;
      resetEnvCache();
    }
  });
});

describe('token isolation', () => {
  it('refuses a member’s token, no token and a damaged token on every developer route', async () => {
    const member = await signUp();
    const token = await developerToken();
    const damaged = `${token.slice(0, -4)}AAAA`;
    const routes = [
      ['get', '/v1/developer/users'],
      ['get', `/v1/developer/users/${member.id}`],
      ['delete', `/v1/developer/users/${member.id}`],
      ['get', '/v1/developer/groups'],
      ['post', '/v1/developer/groups/00000000-0000-4000-8000-000000000000/close'],
    ] as const;
    for (const [method, path] of routes) {
      for (const bearer of [member.accessToken, undefined, damaged]) {
        const res = await dev(bearer)[method](path);
        expect(res.status, `${method} ${path}`).toBe(401);
        expect(res.body.code).toBe('DEVELOPER_UNAUTHENTICATED');
      }
    }
    // The member is still there.
    expect((await prisma().user.findUniqueOrThrow({ where: { id: member.id } })).deletedAt).toBe(
      null,
    );
  });

  it('refuses a developer token on member routes', async () => {
    const token = await developerToken();
    for (const path of ['/v1/me', '/v1/me/groups']) {
      const res = await dev(token).get(path);
      expect(res.status, path).toBe(401);
    }
  });

  it('refuses an expired token and one signed with the member secret', async () => {
    const key = new TextEncoder().encode(JWT_SECRET);
    const past = Math.floor(Date.now() / 1000) - 3_600;
    const expired = await new SignJWT({ role: 'developer' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(USERNAME)
      .setIssuer('njangitrust-api')
      .setAudience('njangitrust-developer')
      .setIssuedAt(past - 1_800)
      .setExpirationTime(past)
      .setJti('expired-token')
      .sign(key);
    expect((await dev(expired).get('/v1/developer/users')).status).toBe(401);

    const memberKey = new TextEncoder().encode(getEnv().JWT_SECRET);
    const forged = await new SignJWT({ role: 'developer' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(USERNAME)
      .setIssuer('njangitrust-api')
      .setAudience('njangitrust-developer')
      .setIssuedAt()
      .setExpirationTime('10m')
      .setJti('forged-token')
      .sign(memberKey);
    expect((await dev(forged).get('/v1/developer/users')).status).toBe(401);
    const real = await signDeveloperToken(USERNAME);
    expect((await dev(real.token).get('/v1/developer/users')).status).toBe(200);
  });
});

describe('reading users', () => {
  it('lists users with their full phone number, finds them by name or number, and pages', async () => {
    const token = await developerToken();
    const member = await signUp();
    const stored = await prisma().user.findUniqueOrThrow({ where: { id: member.id } });

    const byNumber = await dev(token).get(
      `/v1/developer/users?q=${encodeURIComponent(stored.loginPhone.slice(-8))}`,
    );
    expect(byNumber.status).toBe(200);
    expect(byNumber.body.total).toBe(1);
    expect(byNumber.body.items[0]).toMatchObject({
      id: member.id,
      phone: stored.loginPhone,
      status: 'ACTIVE',
      groupCount: 0,
    });
    expect(byNumber.body.items[0].lastLoginAt).not.toBeNull();
    // Nothing secret travels with the row.
    expect(JSON.stringify(byNumber.body)).not.toMatch(/pinHash|argon2|refresh/i);

    const byName = await dev(token).get(`/v1/developer/users?q=${encodeURIComponent(stored.name)}`);
    expect(byName.body.items.some((u: { id: string }) => u.id === member.id)).toBe(true);

    const first = await dev(token).get('/v1/developer/users?pageSize=1&page=1');
    const second = await dev(token).get('/v1/developer/users?pageSize=1&page=2');
    expect(first.body.items).toHaveLength(1);
    expect(second.body.items).toHaveLength(1);
    expect(first.body.items[0].id).not.toBe(second.body.items[0].id);
    expect(first.body.total).toBeGreaterThanOrEqual(2);

    const active = await dev(token).get('/v1/developer/users?status=active&pageSize=100');
    expect(active.body.items.every((u: { status: string }) => u.status === 'ACTIVE')).toBe(true);
    const deleted = await dev(token).get('/v1/developer/users?status=deleted&pageSize=100');
    expect(deleted.body.items.every((u: { status: string }) => u.status === 'DELETED')).toBe(true);
    expect((await dev(token).get('/v1/developer/users?status=other')).status).toBe(400);
    expect((await dev(token).get('/v1/developer/users?pageSize=500')).status).toBe(400);
  });

  it('shows one user in full: numbers, logins, devices, groups and roles', async () => {
    const token = await developerToken();
    const admin = await signUp();
    const { groupId } = await createGroup(admin, { name: 'Njangi du quartier' });
    const member = await addMember(admin, groupId);
    const stored = await prisma().user.findUniqueOrThrow({ where: { id: admin.id } });
    const numbers = await prisma().paymentNumber.findMany({ where: { userId: admin.id } });

    const res = await dev(token).get(`/v1/developer/users/${admin.id}`);
    expect(res.status).toBe(200);
    const user = res.body.user;
    expect(user).toMatchObject({
      id: admin.id,
      name: stored.name,
      phone: stored.loginPhone,
      language: stored.language,
      status: 'ACTIVE',
      deletedAt: null,
      groupCount: 1,
    });
    expect(user.paymentNumbers[0]).toMatchObject({
      number: numbers[0]!.number,
      operator: numbers[0]!.operator,
      activeTo: null,
    });
    expect(user.logins.length).toBeGreaterThanOrEqual(1);
    expect(user.logins[0]).toMatchObject({ client: 'MOBILE', open: true });
    expect(Array.isArray(user.devices)).toBe(true);
    expect(user.memberships).toEqual([
      expect.objectContaining({
        groupId,
        groupName: 'Njangi du quartier',
        groupStatus: 'FORMING',
        groupHidden: false,
        role: 'ADMIN',
        status: 'ACTIVE',
      }),
    ]);

    const asMember = await dev(token).get(`/v1/developer/users/${member.id}`);
    expect(asMember.body.user.memberships[0]).toMatchObject({ groupId, role: 'MEMBER' });
    // The pin hash and the tokens never travel.
    expect(JSON.stringify(res.body)).not.toMatch(/pinHash|tokenHash|expoPushToken/);

    expect((await dev(token).get('/v1/developer/users/not-an-id')).status).toBe(400);
    const missing = await dev(token).get(
      '/v1/developer/users/00000000-0000-4000-8000-000000000000',
    );
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('USER_NOT_FOUND');
  });

  it('does not change what a member sees: another member’s number stays hidden from members', async () => {
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const member = await addMember(admin, groupId);
    // The member client scans every body for foreign numbers; the call itself is the assertion.
    const res = await api(member).get(`/v1/groups/${groupId}/members`);
    expect(res.status).toBe(200);
  });
});

describe('deleting an account', () => {
  it('deletes through the member’s own service, without a PIN, and ends every session', async () => {
    const token = await developerToken();
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const member = await addMember(admin, groupId);
    expect((await api(member).get('/v1/me')).status).toBe(200);
    expect(await prisma().refreshToken.count({ where: { userId: member.id } })).toBeGreaterThan(0);

    const res = await dev(token).delete(`/v1/developer/users/${member.id}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: member.id, status: 'DELETED', phone: null });
    expect(res.body.user.deletedAt).not.toBeNull();

    const row = await prisma().user.findUniqueOrThrow({ where: { id: member.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.loginPhone.startsWith('deleted:')).toBe(true);
    expect(await prisma().refreshToken.count({ where: { userId: member.id } })).toBe(0);
    // The member's access token stops at once.
    expect((await api(member).get('/v1/me')).status).toBe(401);
    // The group keeps its records: the membership is closed, not erased.
    expect(
      (await prisma().membership.findUniqueOrThrow({ where: { id: member.membershipId } })).status,
    ).toBe('LEFT');
    expect(await prisma().message.count({ where: { groupId } })).toBeGreaterThan(0);

    const audits = await prisma().auditLog.findMany({
      where: { action: 'developer.user.deleted', target: `User:${member.id}` },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actorUserId).toBeNull();
    expect(audits[0]!.details).toMatchObject({ developer: USERNAME });

    const again = await dev(token).delete(`/v1/developer/users/${member.id}`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('USER_ALREADY_DELETED');
  });

  it('refuses the admin of a group with a clear coded error, then allows it once the group is closed', async () => {
    const token = await developerToken();
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const res = await dev(token).delete(`/v1/developer/users/${admin.id}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DELETE_IS_ADMIN');
    expect(res.body.messageFr).toMatch(/admin/);
    expect(res.body.messageEn).toMatch(/admin/);
    expect((await prisma().user.findUniqueOrThrow({ where: { id: admin.id } })).deletedAt).toBe(
      null,
    );
    expect((await api(admin).get('/v1/me')).status).toBe(200);
    expect(
      await prisma().auditLog.count({
        where: { action: 'developer.user.deleted', target: `User:${admin.id}` },
      }),
    ).toBe(0);

    // Closing the group lifts the admin blocker: the same deletion now goes through.
    expect((await dev(token).post(`/v1/developer/groups/${groupId}/close`)).status).toBe(200);
    const after = await dev(token).delete(`/v1/developer/users/${admin.id}`);
    expect(after.status).toBe(200);
    expect(after.body.user).toMatchObject({ status: 'DELETED', phone: null });
  });

  it('refuses a member of a running cycle, then allows it once the group is closed', async () => {
    const token = await developerToken();
    const { groupId, members } = await startedGroup(3);
    const member = members[0]!;
    const refused = await dev(token).delete(`/v1/developer/users/${member.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('DELETE_IN_RUNNING_CYCLE');
    expect(refused.body.messageFr).toBeTruthy();

    // Closing the group lifts the cycle blocker only; any debt still blocks.
    expect((await dev(token).post(`/v1/developer/groups/${groupId}/close`)).status).toBe(200);
    const afterClose = await dev(token).delete(`/v1/developer/users/${member.id}`);
    expect(afterClose.status).toBe(200);
    expect(afterClose.body.user.status).toBe('DELETED');
  });

  it('refuses a member who still owes money in a group', async () => {
    const token = await developerToken();
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const member = await addMember(admin, groupId);
    await prisma().obligation.create({
      data: {
        groupId,
        membershipId: member.membershipId,
        kind: 'FINE',
        amount: 1_000,
        dueAt: new Date(Date.now() + 86_400_000),
      },
    });
    const res = await dev(token).delete(`/v1/developer/users/${member.id}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DELETE_HAS_OBLIGATIONS');
    expect((await prisma().user.findUniqueOrThrow({ where: { id: member.id } })).deletedAt).toBe(
      null,
    );
  });

  it('refuses a member with a payment or send in flight', async () => {
    const token = await developerToken();
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const member = await addMember(admin, groupId);
    await prisma().disbursement.create({
      data: {
        groupId,
        membershipId: member.membershipId,
        purpose: 'WITHDRAWAL',
        amount: 5_000,
        feeEstimated: 100,
        phoneSnapshot: 'test',
        provider: 'mock',
        status: 'PENDING',
      },
    });
    const res = await dev(token).delete(`/v1/developer/users/${member.id}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DELETE_OPERATION_IN_PROGRESS');
  });
});

describe('reading groups', () => {
  it('lists groups with member count and cycle state, and shows one in full', async () => {
    const token = await developerToken();
    const admin = await signUp();
    const { groupId } = await createGroup(admin, { name: 'Les Amis de Bonanjo' });
    const member = await addMember(admin, groupId);
    const stored = await prisma().user.findUniqueOrThrow({ where: { id: member.id } });

    const list = await dev(token).get(`/v1/developer/groups?q=${encodeURIComponent('Bonanjo')}`);
    expect(list.status).toBe(200);
    const row = list.body.items.find((g: { id: string }) => g.id === groupId);
    expect(row).toMatchObject({
      name: 'Les Amis de Bonanjo',
      status: 'FORMING',
      hidden: false,
      memberCount: 2,
      cycle: null,
    });

    const detail = await dev(token).get(`/v1/developer/groups/${groupId}`);
    expect(detail.status).toBe(200);
    const group = detail.body.group;
    expect(group.members).toHaveLength(2);
    expect(group.members.find((m: { userId: string }) => m.userId === member.id)).toMatchObject({
      phone: stored.loginPhone,
      role: 'MEMBER',
      status: 'ACTIVE',
    });
    expect(group.inFlight).toEqual({
      openPayments: 0,
      openDisbursements: 0,
      approvedPayouts: 0,
      openVotes: 0,
      pendingActions: 0,
    });

    const running = await startedGroup(3);
    const started = await dev(token).get(`/v1/developer/groups/${running.groupId}`);
    expect(started.body.group).toMatchObject({ status: 'ACTIVE', memberCount: 4 });
    expect((await dev(token).get('/v1/developer/groups?status=bogus')).status).toBe(400);
    const missing = await dev(token).get(
      '/v1/developer/groups/00000000-0000-4000-8000-000000000000',
    );
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('GROUP_NOT_FOUND');
  });
});

describe('closing a group', () => {
  it('closes and hides it, ends votes and cards, and leaves the ledger chain intact', async () => {
    const token = await developerToken();
    const { groupId, admin, members } = await startedGroup(3);
    const proposalId = await propose(admin, groupId, {
      type: 'RULE_CHANGE',
      changes: { minBid: 800 },
    });
    // A card a member prepared and never confirmed.
    const card = await api(members[0]).post(`/v1/proposals/${proposalId}/votes`, { choice: 'YES' });
    expect(card.status).toBe(201);
    expect((await api(members[0]).get('/v1/me/groups')).body.groups.length).toBe(1);
    const before = await readChain(prisma(), groupId);

    const res = await dev(token).post(`/v1/developer/groups/${groupId}/close`);
    expect(res.status).toBe(200);
    expect(res.body.group).toMatchObject({ status: 'CLOSED', hidden: true });
    expect(res.body.group.hiddenAt).not.toBeNull();
    expect(res.body.group.inFlight.openVotes).toBe(0);

    // Votes ended, cards cancelled.
    expect((await prisma().proposal.findUniqueOrThrow({ where: { id: proposalId } })).status).toBe(
      'EXPIRED',
    );
    expect(
      (await prisma().pendingAction.findUniqueOrThrow({ where: { id: card.body.action.id } }))
        .status,
    ).toBe('CANCELLED');

    // Hidden for every member, admin included.
    for (const person of [admin, members[0]!]) {
      const listed = await api(person).get('/v1/me/groups');
      expect(listed.body.groups).toEqual([]);
      const overview = await api(person).get(`/v1/groups/${groupId}/overview`);
      expect(overview.status).toBe(404);
      expect((await api(person).get(`/v1/groups/${groupId}/ledger`)).status).toBe(404);
    }

    // The ledger: no row changed or removed; only the votes' closing event was appended.
    const after = await readChain(prisma(), groupId);
    expect(verifyChain(groupId, after)).toEqual([]);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)).toMatchObject({
      type: 'EVENT',
      metadata: expect.objectContaining({ event: 'VOTE_CLOSED', status: 'EXPIRED' }),
      postings: [],
    });

    // Audited, with the group and the developer.
    const audits = await prisma().auditLog.findMany({
      where: { action: 'developer.group.closed', groupId },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorUserId: null, target: `Group:${groupId}` });
    expect(audits[0]!.details).toMatchObject({
      developer: USERNAME,
      expiredVotes: 1,
      cancelledActions: 1,
    });

    // A second close is refused; the developer still sees the hidden group.
    const again = await dev(token).post(`/v1/developer/groups/${groupId}/close`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('GROUP_ALREADY_CLOSED');
    const seen = await dev(token).get(`/v1/developer/groups/${groupId}`);
    expect(seen.body.group).toMatchObject({ status: 'CLOSED', hidden: true });
  });

  it('refuses while a payment or send is in flight, and changes nothing', async () => {
    const token = await developerToken();
    const { groupId, members } = await startedGroup(3);
    await prisma().disbursement.create({
      data: {
        groupId,
        membershipId: members[0]!.membershipId,
        purpose: 'WITHDRAWAL',
        amount: 5_000,
        feeEstimated: 100,
        phoneSnapshot: 'test',
        provider: 'mock',
        status: 'PENDING',
      },
    });
    const res = await dev(token).post(`/v1/developer/groups/${groupId}/close`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('GROUP_MONEY_IN_FLIGHT');
    expect(res.body.messageFr).toBeTruthy();
    expect(res.body.messageEn).toBeTruthy();
    const group = await prisma().group.findUniqueOrThrow({ where: { id: groupId } });
    expect(group).toMatchObject({ status: 'ACTIVE', hiddenByDeveloperAt: null });
    expect((await api(members[0]).get(`/v1/groups/${groupId}/overview`)).status).toBe(200);
  });

  it('takes no new activity after closing: the scheduled scans skip the group', async () => {
    const token = await developerToken();
    const scheduledRound = async (groupId: string) => {
      const cycle = await prisma().cycle.findFirstOrThrow({ where: { groupId } });
      const past = new Date(Date.now() - 86_400_000);
      return prisma().round.create({
        data: {
          groupId,
          cycleId: cycle.id,
          number: 1,
          dueAt: past,
          payoutAt: past,
          status: 'SCHEDULED',
          ruleSetVersion: 1,
        },
      });
    };
    const closed = await startedGroup(3);
    const running = await startedGroup(3);
    const closedRound = await scheduledRound(closed.groupId);
    const runningRound = await scheduledRound(running.groupId);
    expect((await dev(token).post(`/v1/developer/groups/${closed.groupId}/close`)).status).toBe(
      200,
    );
    const { openDueRounds } = await import('../cycles');
    await openDueRounds();
    // The same scan opens the group that is still running and leaves the closed one alone.
    expect(
      (await prisma().round.findUniqueOrThrow({ where: { id: runningRound.id } })).status,
    ).toBe('OPEN');
    expect((await prisma().round.findUniqueOrThrow({ where: { id: closedRound.id } })).status).toBe(
      'SCHEDULED',
    );
  });

  it('is a developer-only action: a member cannot close a group through it', async () => {
    const { groupId, admin } = await startedGroup(3);
    const res = await dev(admin.accessToken).post(`/v1/developer/groups/${groupId}/close`);
    expect(res.status).toBe(401);
    expect(
      (await prisma().group.findUniqueOrThrow({ where: { id: groupId } })).hiddenByDeveloperAt,
    ).toBeNull();
  });
});
