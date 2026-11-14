import { afterEach, describe, expect, it } from 'vitest';
import { advanceTestClock, resetTestClock, setTestClock } from '../../lib/clock';
import { getPrisma } from '../../lib/prisma';
import { api } from '../../../test/helpers/client';
import {
  addMember,
  confirm,
  createGroup,
  inviteToken,
  markFirstCycleStarted,
  ownPhonesOf,
  passedMemberAdd,
  signUp,
  signupBody,
} from '../../../test/helpers/factories';

const accept = (token: string, body: Record<string, unknown>) =>
  api(null, { ownPhones: ownPhonesOf(body as { phone: string }) }).post(
    `/v1/auth/invites/${token}/accept`,
    { mode: 'signup', ...body },
  );

describe('invites (spec 2.10, R1.5, R1.6, R12.1)', () => {
  afterEach(() => resetTestClock());

  it('shows the group, the inviter and the current rules before joining (R1.5)', async () => {
    const admin = await signUp();
    const { groupId } = await createGroup(admin, { rules: { lateFine: 1_500 } });
    const person = signupBody();
    const token = await inviteToken(admin, groupId, person);
    const res = await api().get(`/v1/auth/invites/${token}`);
    expect(res.body.invite).toMatchObject({
      invitedByName: admin.name,
      inviteeName: person.name,
      founding: true,
      memberCount: 1,
    });
    expect(res.body.invite.rules.params.lateFine).toBe(1_500);
  });

  it('works only with the invited phone, and a wrong phone does not use it up', async () => {
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const person = signupBody();
    const token = await inviteToken(admin, groupId, person);
    const wrong = await accept(token, signupBody({ name: person.name }));
    expect(wrong.status).toBe(403);
    expect(wrong.body.code).toBe('INVITE_PHONE_MISMATCH');
    const right = await accept(token, person);
    expect(right.status).toBe(201);
    expect(right.body.me).toMatchObject({ role: 'MEMBER', status: 'ACTIVE' });
  });

  it('is single use', async () => {
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const person = signupBody();
    const token = await inviteToken(admin, groupId, person);
    expect((await accept(token, person)).status).toBe(201);
    const again = await accept(token, person);
    expect(again.status).toBe(410);
    expect(again.body.code).toBe('INVITE_USED');
  });

  it('expires after 72 hours', async () => {
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const person = signupBody();
    setTestClock(new Date());
    const token = await inviteToken(admin, groupId, person);
    advanceTestClock(72 * 3_600_000 + 1_000);
    expect((await api().get(`/v1/auth/invites/${token}`)).body.code).toBe('INVITE_EXPIRED');
    expect((await accept(token, person)).body.code).toBe('INVITE_EXPIRED');
  });

  it('stores neither the phone nor the token in clear', async () => {
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const person = signupBody();
    const token = await inviteToken(admin, groupId, person);
    const row = await getPrisma().invite.findFirstOrThrow({ where: { groupId } });
    const stored = JSON.stringify(row);
    expect(stored).not.toContain(person.phone.slice(4));
    expect(stored).not.toContain(token);
  });

  it('lets someone with an account join while logged in, matching their login phone', async () => {
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const existing = await signUp();
    const token = await inviteToken(admin, groupId, { name: existing.name, phone: existing.phone });
    const joined = await api(existing).post(`/v1/auth/invites/${token}/accept`, {
      mode: 'existing',
    });
    expect(joined.status).toBe(201);
    expect(joined.body.session).toBeUndefined();
    const other = await signUp();
    const token2 = await inviteToken(admin, groupId, {
      name: 'Ivo Fon',
      phone: signupBody().phone,
    });
    expect(
      (await api(other).post(`/v1/auth/invites/${token2}/accept`, { mode: 'existing' })).body.code,
    ).toBe('INVITE_PHONE_MISMATCH');
    expect(
      (await api().post(`/v1/auth/invites/${token2}/accept`, { mode: 'existing' })).status,
    ).toBe(401);
  });

  it('refuses a second invite for the same person while one is valid, and members joining twice', async () => {
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const member = await addMember(admin, groupId);
    const person = signupBody();
    await inviteToken(admin, groupId, person);
    const again = await api(admin).post(`/v1/groups/${groupId}/invites`, {
      name: person.name,
      phone: person.phone,
    });
    expect(again.body.code).toBe('INVITE_ALREADY_PENDING');
    const token = await inviteToken(admin, groupId, { name: member.name, phone: member.phone });
    expect(
      (await api(member).post(`/v1/auth/invites/${token}/accept`, { mode: 'existing' })).body.code,
    ).toBe('ALREADY_MEMBER');
  });

  it('after the first cycle, needs a passed MEMBER_ADD for that same phone (R12.1)', async () => {
    const admin = await signUp();
    const { groupId, adminMembershipId } = await createGroup(admin);
    await markFirstCycleStarted(groupId);
    const person = signupBody();
    const proposalId = await passedMemberAdd(groupId, adminMembershipId, person);
    const otherPhone = await api(admin).post(`/v1/groups/${groupId}/invites`, {
      name: person.name,
      phone: signupBody().phone,
      proposalId,
    });
    expect(otherPhone.body.code).toBe('PROPOSAL_PHONE_MISMATCH');
    const token = await inviteToken(admin, groupId, { ...person, proposalId });
    expect((await accept(token, person)).body.me).toMatchObject({ status: 'INVITED' });
    const reuse = await api(admin).post(`/v1/groups/${groupId}/invites`, {
      name: person.name,
      phone: person.phone,
      proposalId,
    });
    expect(reuse.body.code).toBe('PROPOSAL_ALREADY_USED');
  });

  it('lets only the admin invite, and lists invites without any phone number', async () => {
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const member = await addMember(admin, groupId);
    const res = await api(member).post(`/v1/groups/${groupId}/invites`, {
      name: 'Ivo Fon',
      phone: signupBody().phone,
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ADMIN_ONLY');
    const list = await api(admin).get(`/v1/groups/${groupId}/invites`);
    expect(list.body.invites[0]).toEqual({
      id: expect.any(String),
      inviteeName: member.name,
      status: 'USED',
      founding: true,
      expiresAt: expect.any(String),
      createdAt: expect.any(String),
    });
  });

  it('returns the link only once: the action never stores it', async () => {
    const admin = await signUp();
    const { groupId } = await createGroup(admin);
    const card = await api(admin).post(`/v1/groups/${groupId}/invites`, {
      name: 'Ivo Fon',
      phone: signupBody().phone,
    });
    const done = await confirm(admin, card.body.action.id);
    const token = String(done.body.data.link).split('/invite/')[1]!;
    const row = await getPrisma().pendingAction.findUniqueOrThrow({
      where: { id: card.body.action.id },
    });
    expect(JSON.stringify(row)).not.toContain(token);
    const again = await api(admin).get(`/v1/pending-actions/${card.body.action.id}`);
    expect(JSON.stringify(again.body)).not.toContain(token);
  });
});
