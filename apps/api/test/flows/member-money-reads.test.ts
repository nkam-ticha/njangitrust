// The member's own money reads for the Caisse screen (spec 2.6, 2.7): what I owe, and my money in
// the group. Read-only; a payment or withdrawal is still a card the member confirms.
import { beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '../../src/lib/prisma';
import { api, type TestUser } from '../helpers/client';
import { addMember, confirm, createGroup, signUp } from '../helpers/factories';

type Member = TestUser & { membershipId: string };

let groupId: string;
let admin: Member;
let member: Member;

beforeAll(async () => {
  const user = await signUp();
  const created = await createGroup(user);
  groupId = created.groupId;
  admin = { ...user, membershipId: created.adminMembershipId };
  // A cycle needs at least three members (spec R1.1).
  member = await addMember(admin, groupId);
  await addMember(admin, groupId);
  const card = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
  expect((await confirm(admin, card.body.action.id)).status).toBe(200);
});

describe('what I owe (spec 2.6, GET /groups/:id/me/dues)', () => {
  it('lists only my own open obligations, oldest first, with ISO dates and integer amounts', async () => {
    const res = await api(member).get(`/v1/groups/${groupId}/me/dues`);
    expect(res.status).toBe(200);
    const mine = await getPrisma().obligation.findMany({
      where: { groupId, membershipId: member.membershipId, status: 'DUE' },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    });
    expect(res.body.dues.map((due: { id: string }) => due.id)).toEqual(mine.map((o) => o.id));
    expect(mine.length).toBeGreaterThan(0);
    for (const due of res.body.dues as Array<Record<string, unknown>>) {
      expect(Number.isSafeInteger(due.amount)).toBe(true);
      expect(typeof due.dueAt).toBe('string');
      expect(new Date(due.dueAt as string).toISOString()).toBe(due.dueAt);
      expect(Object.keys(due).sort()).toEqual(
        ['amount', 'dueAt', 'id', 'kind', 'loanId', 'roundNumber'].sort(),
      );
    }
  });

  it('refuses a stranger to the group', async () => {
    const stranger = await signUp();
    const res = await api(stranger).get(`/v1/groups/${groupId}/me/dues`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('my money in the group (spec 2.7, GET /groups/:id/me/money)', () => {
  it('reports integer figures and no hold for a member who has not been paid', async () => {
    const res = await api(member).get(`/v1/groups/${groupId}/me/money`);
    expect(res.status).toBe(200);
    const money = res.body.money;
    expect(money).toMatchObject({
      available: 0,
      locked: 0,
      unlocksAt: null,
      hold: null,
      withdrawalInProgress: false,
    });
    // The daily check is shared by the test database's provider account, so only its type is fixed.
    expect(typeof money.withdrawalsPaused).toBe('boolean');
    for (const key of ['available', 'locked', 'debtsDue'] as const) {
      expect(Number.isSafeInteger(money[key])).toBe(true);
    }
  });
});
