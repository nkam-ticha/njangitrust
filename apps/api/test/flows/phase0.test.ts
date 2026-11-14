// Phase 0 done-when (spec Part 6): a user creates a group, invites a member through an approved
// proposal stub, and that member logs in.
import { describe, expect, it } from 'vitest';
import { api } from '../helpers/client';
import {
  addMember,
  confirm,
  createGroup,
  markFirstCycleStarted,
  passedMemberAdd,
  signUp,
  signupBody,
  TEST_PIN,
  toTestUser,
} from '../helpers/factories';

describe('Phase 0: create a group, invite through an approved proposal, log in', () => {
  it('runs the whole flow', async () => {
    const admin = await signUp();
    const { groupId, adminMembershipId } = await createGroup(admin);
    await addMember(admin, groupId);
    await addMember(admin, groupId);
    await markFirstCycleStarted(groupId);

    const newcomer = signupBody();
    // After the first cycle, an invite without a passed MEMBER_ADD is refused (R1.6, R12.1).
    const refused = await api(admin).post(`/v1/groups/${groupId}/invites`, {
      name: newcomer.name,
      phone: newcomer.phone,
    });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('PROPOSAL_REQUIRED');

    const proposalId = await passedMemberAdd(groupId, adminMembershipId, newcomer);
    const card = await api(admin).post(`/v1/groups/${groupId}/invites`, {
      name: newcomer.name,
      phone: newcomer.phone,
      proposalId,
    });
    expect(card.status).toBe(201);
    expect(card.body.action.status).toBe('PENDING');
    expect(card.body.action.preview.title.fr).toContain(newcomer.name);

    const done = await confirm(admin, card.body.action.id);
    expect(done.status).toBe(200);
    expect(done.body.action.status).toBe('DONE');
    const token = String(done.body.data.link).split('/invite/')[1]!;

    const preview = await api().get(`/v1/auth/invites/${token}`);
    expect(preview.status).toBe(200);
    expect(preview.body.invite.groupName).toBe('Njangi des Collègues');
    expect(preview.body.invite.rules.params.contributionAmount).toBe(10_000);

    const accepted = await api(null, { ownPhones: [newcomer.phone] }).post(
      `/v1/auth/invites/${token}/accept`,
      { mode: 'signup', ...newcomer },
    );
    expect(accepted.status).toBe(201);
    // R12.1: joins now, active from the next cycle.
    expect(accepted.body.me.status).toBe('INVITED');

    const login = await api(null, { ownPhones: [newcomer.phone] }).post('/v1/auth/login', {
      phone: newcomer.phone,
      pin: TEST_PIN,
    });
    expect(login.status).toBe(200);
    const member = toTestUser(login.body);
    const groups = await api(member).get('/v1/me/groups');
    expect(groups.body.groups).toEqual([
      expect.objectContaining({ groupId, membershipStatus: 'INVITED' }),
    ]);
    const members = await api(member).get(`/v1/groups/${groupId}/members`);
    expect(members.status).toBe(200);
    expect(members.body.members).toHaveLength(4);
  });
});
