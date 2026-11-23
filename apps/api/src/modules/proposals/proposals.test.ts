import { afterEach, describe, expect, it } from 'vitest';
import { useJobScheduler } from '../../jobs/dispatch';
import { hashPhone } from '../../lib/crypto';
import { getPrisma } from '../../lib/prisma';
import { api, type TestUser } from '../../../test/helpers/client';
import {
  addMember,
  confirm,
  createGroup,
  inviteToken,
  markFirstCycleStarted,
  signUp,
  signupBody,
} from '../../../test/helpers/factories';

async function startedGroup() {
  const admin = await signUp();
  const { groupId, adminMembershipId } = await createGroup(admin);
  const carine = await addMember(admin, groupId);
  const paul = await addMember(admin, groupId);
  await markFirstCycleStarted(groupId);
  return { admin: { ...admin, membershipId: adminMembershipId }, carine, paul, groupId };
}

afterEach(() => useJobScheduler(null));

async function vote(user: TestUser, proposalId: string, choice: 'YES' | 'NO') {
  const card = await api(user).post(`/v1/proposals/${proposalId}/votes`, { choice });
  if (card.status !== 201) return card;
  return confirm(user, card.body.action.id);
}

describe('MEMBER_ADD proposal and votes (R11, R12.1)', () => {
  it('opens a vote, passes at the majority of eligible members, and allows the invite', async () => {
    const { admin, carine, paul, groupId } = await startedGroup();
    const person = signupBody();
    const card = await api(carine).post(`/v1/groups/${groupId}/proposals`, {
      type: 'MEMBER_ADD',
      name: person.name,
      phone: person.phone,
      reason: 'Collègue fiable',
    });
    expect(card.status).toBe(201);
    const notes = (card.body.action.preview.notes as Array<{ fr: string }>).map((n) => n.fr);
    expect(notes[0]).toMatch(/^Majorité\s:\s2 oui sur 3$/);
    expect(JSON.stringify(card.body)).not.toContain(person.phone.slice(4));

    const opened = await confirm(carine, card.body.action.id);
    expect(opened.status).toBe(200);
    const proposalId = opened.body.action.result.ref as string;
    const view = (await api(paul).get(`/v1/proposals/${proposalId}`)).body.proposal;
    expect(view).toMatchObject({
      status: 'OPEN',
      requiredYes: 2,
      eligibleCount: 3,
      participation: 0,
      tally: { yes: 0, no: 0 },
      canVote: true,
      subject: { type: 'MEMBER_ADD', inviteeName: person.name },
    });

    expect((await vote(carine, proposalId, 'YES')).status).toBe(200);
    expect(
      (await api(carine).post(`/v1/proposals/${proposalId}/votes`, { choice: 'NO' })).body.code,
    ).toBe('ALREADY_VOTED');
    expect((await vote(paul, proposalId, 'YES')).status).toBe(200);
    const passed = (await api(admin).get(`/v1/proposals/${proposalId}`)).body.proposal;
    expect(passed).toMatchObject({
      status: 'PASSED',
      tally: { yes: 2, no: 0 },
      canVote: false,
      effect: { fr: expect.stringContaining(person.name) },
    });
    expect(
      (await api(admin).post(`/v1/proposals/${proposalId}/votes`, { choice: 'YES' })).body.code,
    ).toBe('PROPOSAL_CLOSED');

    const token = await inviteToken(admin, groupId, {
      name: person.name,
      phone: person.phone,
      proposalId,
    });
    expect(token).toHaveLength(43);
  });

  it('rejects as soon as the majority can no longer be reached', async () => {
    const { carine, paul, admin, groupId } = await startedGroup();
    const person = signupBody();
    const card = await api(admin).post(`/v1/groups/${groupId}/proposals`, {
      type: 'MEMBER_ADD',
      name: person.name,
      phone: person.phone,
    });
    const proposalId = (await confirm(admin, card.body.action.id)).body.action.result.ref as string;
    await vote(carine, proposalId, 'NO');
    await vote(paul, proposalId, 'NO');
    expect((await api(admin).get(`/v1/proposals/${proposalId}`)).body.proposal.status).toBe(
      'REJECTED',
    );
  });

  it('shows the result when the deciding vote returns, without waiting for any queued job', async () => {
    const { carine, paul, admin, groupId } = await startedGroup();
    const person = signupBody();
    const card = await api(admin).post(`/v1/groups/${groupId}/proposals`, {
      type: 'MEMBER_ADD',
      name: person.name,
      phone: person.phone,
    });
    const proposalId = (await confirm(admin, card.body.action.id)).body.action.result.ref as string;
    // A serverless host: queued jobs run at the next cron tick, which never comes in this test.
    useJobScheduler(() => Promise.resolve());
    await vote(carine, proposalId, 'YES');
    expect((await api(admin).get(`/v1/proposals/${proposalId}`)).body.proposal.status).toBe('OPEN');
    await vote(paul, proposalId, 'YES');
    expect((await api(admin).get(`/v1/proposals/${proposalId}`)).body.proposal).toMatchObject({
      status: 'PASSED',
      tally: { yes: 2, no: 0 },
    });
  });

  it('lets only members active when the proposal was made vote (3.1)', async () => {
    const { admin, groupId } = await startedGroup();
    const person = signupBody();
    const card = await api(admin).post(`/v1/groups/${groupId}/proposals`, {
      type: 'MEMBER_ADD',
      name: person.name,
      phone: person.phone,
    });
    const proposalId = (await confirm(admin, card.body.action.id)).body.action.result.ref as string;
    const outsider = await signUp();
    expect(
      (await api(outsider).post(`/v1/proposals/${proposalId}/votes`, { choice: 'YES' })).status,
    ).toBe(404);
  });
});

describe('secret ballots (R11.5)', () => {
  async function secretProposal() {
    const { admin, carine, paul, groupId } = await startedGroup();
    const now = new Date();
    const proposal = await getPrisma().proposal.create({
      data: {
        groupId,
        type: 'MEMBER_ADD',
        payload: { inviteeName: 'Ivo Fon', phoneHash: hashPhone(signupBody().phone) },
        proposerMembershipId: admin.membershipId,
        secret: true,
        thresholdKind: 'MAJORITY',
        eligibleMembershipIds: [admin.membershipId, carine.membershipId, paul.membershipId],
        opensAt: now,
        closesAt: new Date(now.getTime() + 72 * 3_600_000),
      },
    });
    return { admin, carine, paul, proposalId: proposal.id };
  }

  it('never stores the choice next to the voter, not even in the pending card', async () => {
    const { carine, proposalId } = await secretProposal();
    const card = await api(carine).post(`/v1/proposals/${proposalId}/votes`, { choice: 'YES' });
    expect(card.body.action.preview.title.fr).toBe('Voter oui');
    const pendingRow = await getPrisma().pendingAction.findUniqueOrThrow({
      where: { id: card.body.action.id },
    });
    // Sealed while pending (random base64 text can spell anything, so it is checked by shape).
    expect(Object.keys(pendingRow.args as object)).toEqual(['sealed']);
    expect(Object.keys(pendingRow.preview as object)).toEqual(['sealed']);
    const unsealed = { ...pendingRow, args: null, preview: null };
    expect(JSON.stringify(unsealed)).not.toMatch(/YES|Voter oui|Vote yes/);

    const done = await confirm(carine, card.body.action.id);
    expect(done.status).toBe(200);
    const doneRow = await getPrisma().pendingAction.findUniqueOrThrow({
      where: { id: card.body.action.id },
    });
    expect(JSON.stringify(doneRow)).not.toMatch(/YES|Voter oui|Vote yes|sealed/);
    expect(await getPrisma().ballot.count({ where: { proposalId } })).toBe(0);
    expect(await getPrisma().voteReceipt.count({ where: { proposalId } })).toBe(1);
    const audit = await getPrisma().auditLog.findMany({ where: { actorUserId: carine.id } });
    expect(JSON.stringify(audit)).not.toContain('YES');
  });

  it('shows only participation while open, and the viewer’s own vote only as "voted"', async () => {
    const { carine, paul, proposalId } = await secretProposal();
    await vote(carine, proposalId, 'NO');
    const asCarine = (await api(carine).get(`/v1/proposals/${proposalId}`)).body.proposal;
    expect(asCarine).toMatchObject({
      participation: 1,
      tally: null,
      myVote: 'VOTED',
      secret: true,
    });
    // L10: never a list of who voted what for a secret proposal.
    expect(asCarine.votes).toBeNull();
    const asPaul = (await api(paul).get(`/v1/proposals/${proposalId}`)).body.proposal;
    expect(asPaul).toMatchObject({ participation: 1, tally: null, myVote: null });
  });

  it('cannot store a ballot for a secret proposal, even by direct database access', async () => {
    const { carine, proposalId } = await secretProposal();
    await expect(
      getPrisma().ballot.create({
        data: { proposalId, membershipId: carine.membershipId, choice: 'YES' },
      }),
    ).rejects.toThrow(/secret proposal never stores ballots/);
  });
});
