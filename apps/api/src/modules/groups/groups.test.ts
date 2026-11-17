import { describe, expect, it } from 'vitest';
import { api } from '../../../test/helpers/client';
import { createGroup, futurePayout, signUp, signupBody } from '../../../test/helpers/factories';
import { permissionMatrix, useWorld } from '../../../test/helpers/permission-matrix';

describe('creating a group (spec 2.7, 3.2, R1.1)', () => {
  it('makes the creator the admin and stores rule set version 1 from the defaults', async () => {
    const admin = await signUp();
    const firstPayoutAt = futurePayout();
    const res = await api(admin).post('/v1/groups', {
      name: 'Njangi des Collègues',
      firstPayoutAt,
      rules: { contributionAmount: 25_000 },
    });
    expect(res.status).toBe(201);
    expect(res.body.me).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' });
    expect(res.body.group).toMatchObject({ status: 'FORMING', memberCount: 1, firstPayoutAt });
    const rules = await api(admin).get(`/v1/groups/${res.body.group.id}/rules`);
    expect(rules.body.ruleSet.version).toBe(1);
    expect(rules.body.ruleSet.params).toMatchObject({
      contributionAmount: 25_000,
      solidarityContribution: 1_000,
      lateFine: 1_000,
      frequency: 'MONTHLY',
      payoutTime: { hour: 18, minute: 0, monthlyAnchor: { kind: 'DAY_OF_MONTH' } },
    });
  });

  it('refuses values outside the allowed ranges, naming the rule in both languages (R11.7)', async () => {
    const admin = await signUp();
    const res = await api(admin).post('/v1/groups', {
      name: 'Njangi',
      firstPayoutAt: futurePayout(),
      rules: { contributionAmount: 24 },
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RULE_VALUE_OUT_OF_RANGE');
    expect(res.body.messageFr).toContain('montant de la cotisation');
    expect(res.body.messageEn).toContain('contribution amount');
    expect(res.body.details).toMatchObject({
      parameter: 'contributionAmount',
      min: 25,
      max: 1_000_000,
    });
  });

  it('refuses a first payout in the past and unknown rule names', async () => {
    const admin = await signUp();
    const past = await api(admin).post('/v1/groups', {
      name: 'Njangi',
      firstPayoutAt: '2020-01-01T17:00:00.000Z',
    });
    expect(past.body.code).toBe('FIRST_PAYOUT_IN_PAST');
    const unknown = await api(admin).post('/v1/groups', {
      name: 'Njangi',
      firstPayoutAt: futurePayout(),
      rules: { adminSalary: 5 },
    });
    expect(unknown.body.code).toBe('VALIDATION_FAILED');
  });

  it('lists the member’s groups', async () => {
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const res = await api(admin).get('/v1/me/groups');
    expect(res.body.groups).toEqual([
      {
        groupId,
        name: 'Njangi des Collègues',
        status: 'FORMING',
        membershipId: expect.any(String),
        role: 'ADMIN',
        membershipStatus: 'ACTIVE',
        memberCount: 1,
      },
    ]);
  });
});

describe('group endpoints, as every kind of caller (spec 5.3)', () => {
  const world = useWorld();
  const readers = { member: 200, admin: 200, outsider: 404, left: 403, anonymous: 401 };

  permissionMatrix('GET /groups/:id/overview', world, {
    call: (client, w) => client.get(`/v1/groups/${w.groupId}/overview`),
    expect: readers,
  });
  permissionMatrix('GET /groups/:id/members', world, {
    call: (client, w) => client.get(`/v1/groups/${w.groupId}/members`),
    expect: readers,
  });
  permissionMatrix('GET /groups/:id/rules', world, {
    call: (client, w) => client.get(`/v1/groups/${w.groupId}/rules`),
    expect: readers,
  });
  permissionMatrix('GET /groups/:id/proposals', world, {
    call: (client, w) => client.get(`/v1/groups/${w.groupId}/proposals`),
    expect: readers,
  });
  permissionMatrix('GET /groups/:id/pin-resets', world, {
    call: (client, w) => client.get(`/v1/groups/${w.groupId}/pin-resets`),
    expect: readers,
  });
  permissionMatrix('GET /groups/:id/invites', world, {
    call: (client, w) => client.get(`/v1/groups/${w.groupId}/invites`),
    expect: { member: 403, admin: 200, outsider: 404, left: 403, anonymous: 401 },
  });
  permissionMatrix('POST /groups/:id/invites', world, {
    call: (client, w) =>
      client.post(`/v1/groups/${w.groupId}/invites`, {
        name: 'Larissa Ngono',
        phone: signupBody().phone,
      }),
    expect: { member: 403, admin: 201, outsider: 404, left: 403, anonymous: 401 },
  });
  permissionMatrix('POST /groups/:id/proposals before the first cycle', world, {
    call: (client, w) =>
      client.post(`/v1/groups/${w.groupId}/proposals`, {
        type: 'MEMBER_ADD',
        name: 'Ivo Fon',
        phone: signupBody().phone,
      }),
    expect: { member: 409, admin: 409, outsider: 404, left: 403, anonymous: 401 },
  });
  permissionMatrix('GET /me/groups', world, {
    call: (client) => client.get('/v1/me/groups'),
    expect: { member: 200, admin: 200, outsider: 200, left: 200, anonymous: 401 },
  });

  it('answers "not found" for a group id that does not exist or is malformed', async () => {
    const w = world();
    expect(
      (await api(w.member).get('/v1/groups/00000000-0000-4000-8000-000000000000/overview')).status,
    ).toBe(404);
    expect((await api(w.member).get('/v1/groups/not-a-uuid/overview')).status).toBe(400);
  });
});
