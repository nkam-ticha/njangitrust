// START_CYCLE (R1.1, GRP-02/03) and LEAVE_AT_CYCLE_END (R12.2, MEM-01), with the permission
// matrix of every Phase 5 endpoint (spec 5.3).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '../../lib/prisma';
import { api } from '../../../test/helpers/client';
import {
  addMember,
  confirm,
  createGroup,
  signUp,
  signupBody,
} from '../../../test/helpers/factories';
import {
  callsTo,
  installFakeMoney,
  uninstallFakeMoney,
  type FakeMoney,
} from '../../../test/helpers/fake-money-port';
import { proposalOf, propose, startedGroup, vote } from '../../../test/helpers/governance';
import { permissionMatrix, useWorld } from '../../../test/helpers/permission-matrix';

let money: FakeMoney;
beforeAll(() => {
  money = installFakeMoney();
});
afterAll(() => uninstallFakeMoney());

describe('starting the first cycle (GRP-02, GRP-03)', () => {
  it('needs three active members, is the admin’s, and hands the draw to the money modules', async () => {
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const one = await addMember(admin, groupId);
    const short = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
    expect(short.status).toBe(409);
    expect(short.body.code).toBe('NOT_ENOUGH_MEMBERS');
    expect(short.body.messageFr).toMatch(/Il manque 1 membre/);
    await addMember(admin, groupId);
    expect((await api(one).post(`/v1/groups/${groupId}/cycles/start`)).body.code).toBe(
      'ADMIN_ONLY',
    );
    const card = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
    expect(card.body.action.preview.title.fr).toBe('Démarrer le cycle 1');
    expect((await confirm(admin, card.body.action.id)).status).toBe(200);
    expect(callsTo(money, 'startCycle').map((c) => c.input)).toContainEqual(
      expect.objectContaining({ groupId }),
    );
    expect((await api(admin).get(`/v1/groups/${groupId}/overview`)).body.group.status).toBe(
      'ACTIVE',
    );
    expect((await api(admin).post(`/v1/groups/${groupId}/cycles/start`)).body.code).toBe(
      'CYCLE_ALREADY_STARTED',
    );
  });
});

describe('leaving at the end of the cycle (R12.2)', () => {
  it('marks the member LEAVING, who keeps voting until the cycle closes', async () => {
    const { groupId, admin, members } = await startedGroup(3);
    expect((await api(admin).post(`/v1/groups/${groupId}/leave`)).body.code).toBe(
      'ADMIN_MUST_CHANGE_FIRST',
    );
    const card = await api(members[0]).post(`/v1/groups/${groupId}/leave`);
    expect((await confirm(members[0]!, card.body.action.id)).status).toBe(200);
    const status = await getPrisma().membership.findUniqueOrThrow({
      where: { id: members[0]!.membershipId },
    });
    expect(status.status).toBe('LEAVING');
    expect((await api(members[0]).post(`/v1/groups/${groupId}/leave`)).body.code).toBe(
      'ALREADY_LEAVING',
    );
    const id = await propose(admin, groupId, { type: 'RULE_CHANGE', changes: { minBid: 800 } });
    expect((await proposalOf(members[0]!, id)).canVote).toBe(true);
    expect((await vote(members[0]!, id, 'YES')).status).toBe(200);
  });
});

describe('Phase 5 endpoints, as every kind of caller (spec 5.3)', () => {
  const world = useWorld();

  permissionMatrix('GET /groups/:id/solidarity', world, {
    call: (client, w) => client.get(`/v1/groups/${w.groupId}/solidarity`),
    expect: { member: 200, admin: 200, outsider: 404, left: 403, anonymous: 401 },
  });
  // The world's group has not started its first cycle: votes and leaving wait for it.
  permissionMatrix('POST /groups/:id/solidarity-requests before the first cycle', world, {
    call: (client, w) =>
      client.post(`/v1/groups/${w.groupId}/solidarity-requests`, {
        recipientMembershipId: w.member.membershipId,
        event: 'MALADIE',
        amount: 5_000,
      }),
    expect: { member: 409, admin: 409, outsider: 404, left: 403, anonymous: 401 },
  });
  permissionMatrix('POST /groups/:id/leave before the first cycle', world, {
    call: (client, w) => client.post(`/v1/groups/${w.groupId}/leave`),
    expect: { member: 409, admin: 409, outsider: 404, left: 403, anonymous: 401 },
  });
  permissionMatrix('POST /groups/:id/cycles/start with two active members', world, {
    call: (client, w) => client.post(`/v1/groups/${w.groupId}/cycles/start`),
    expect: { member: 403, admin: 409, outsider: 404, left: 403, anonymous: 401 },
  });
  permissionMatrix('POST /groups/:id/proposals (MEMBER_ADD) before the first cycle', world, {
    call: (client, w) =>
      client.post(`/v1/groups/${w.groupId}/proposals`, {
        type: 'MEMBER_ADD',
        name: 'Ivo Fon',
        phone: signupBody().phone,
      }),
    expect: { member: 409, admin: 409, outsider: 404, left: 403, anonymous: 401 },
  });
  permissionMatrix('GET /notifications', world, {
    call: (client) => client.get('/v1/notifications'),
    expect: { member: 200, admin: 200, outsider: 200, left: 200, anonymous: 401 },
  });
  permissionMatrix('PUT /me/notification-prefs', world, {
    call: (client) => client.put('/v1/me/notification-prefs', { mutedCategories: ['GROUP'] }),
    expect: { member: 200, admin: 200, outsider: 200, left: 200, anonymous: 401 },
  });
});
