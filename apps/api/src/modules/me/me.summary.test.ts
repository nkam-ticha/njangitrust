// The combined summary of all my groups (FSD GRP-05): one line per group I am in now, with the figures
// of the group's own services; a group I left, a closed one and one a developer hid are not listed;
// nobody sees a group they are not in.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { combinedSummarySchema } from '@njangi/shared/contracts/me';
import { getPrisma } from '../../lib/prisma';
import { chatWorld, type ChatWorld } from '../../../test/helpers/chat-world';
import { createGroup, signUp } from '../../../test/helpers/factories';
import { stageApi } from '../../../test/helpers/stage-client';

let w: ChatWorld;
let formingGroupId: string;
let leftGroupId: string;
let hiddenGroupId: string;
let closedGroupId: string;

const DAY = 86_400_000;

async function joinAs(userId: string, groupId: string, status: 'ACTIVE' | 'LEFT') {
  await getPrisma().membership.create({ data: { groupId, userId, role: 'MEMBER', status } });
}

beforeAll(async () => {
  w = await chatWorld();
  const prisma = getPrisma();
  const group = await prisma.group.findUniqueOrThrow({ where: { id: w.groupId } });
  const now = Date.now();
  // Round 1 is open and the cycle has two rounds.
  const round = await prisma.round.create({
    data: {
      groupId: w.groupId,
      cycleId: group.currentCycleId!,
      number: 1,
      dueAt: new Date(now + 5 * DAY),
      payoutAt: new Date(now + 6 * DAY),
      status: 'OPEN',
      ruleSetVersion: 1,
    },
  });
  await prisma.round.create({
    data: {
      groupId: w.groupId,
      cycleId: group.currentCycleId!,
      number: 2,
      dueAt: new Date(now + 35 * DAY),
      payoutAt: new Date(now + 36 * DAY),
      status: 'SCHEDULED',
      ruleSetVersion: 1,
    },
  });
  // Bea owes her contribution and the solidarity part.
  for (const [kind, amount] of [
    ['CONTRIBUTION', 10_000],
    ['SOLIDARITY', 1_000],
  ] as const) {
    await prisma.obligation.create({
      data: {
        groupId: w.groupId,
        membershipId: w.bea.membershipId,
        kind,
        roundId: round.id,
        amount,
        dueAt: round.dueAt,
        status: 'DUE',
      },
    });
  }
  // Carl writes once in the group: one unread message for Bea.
  await prisma.message.create({
    data: {
      groupId: w.groupId,
      authorMembershipId: w.carl.membershipId,
      kind: 'TEXT',
      text: 'Bonjour à tous',
    },
  });
  // Two open votes, each a waiver of another member's fine (that member is the subject and does not
  // vote, D15.2): Bea has not voted on the first and has voted on the second.
  const waiver = (subject: { membershipId: string }, voters: { membershipId: string }[]) => ({
    groupId: w.groupId,
    type: 'FINE_WAIVER' as const,
    payload: {
      obligationId: randomUUID(),
      membershipId: subject.membershipId,
      amount: 1_000,
      roundNumber: 1,
    },
    subjectMembershipId: subject.membershipId,
    proposerMembershipId: w.admin.membershipId,
    secret: false,
    thresholdKind: 'MAJORITY' as const,
    eligibleMembershipIds: voters.map((v) => v.membershipId),
    opensAt: new Date(now - 3_600_000),
    closesAt: new Date(now + 3 * DAY),
    status: 'OPEN' as const,
  });
  await prisma.proposal.create({ data: waiver(w.dina, [w.admin, w.bea, w.carl]) });
  const voted = await prisma.proposal.create({ data: waiver(w.carl, [w.admin, w.bea, w.dina]) });
  await prisma.voteReceipt.create({
    data: { proposalId: voted.id, membershipId: w.bea.membershipId },
  });
  await prisma.ballot.create({
    data: { proposalId: voted.id, membershipId: w.bea.membershipId, choice: 'YES' },
  });

  // Bea is also in a group still forming (the stranger's), in one she left, one a developer hid, and one closed.
  formingGroupId = w.strangerGroupId;
  await joinAs(w.bea.id, formingGroupId, 'ACTIVE');
  const admin = await signUp();
  leftGroupId = (await createGroup(admin, { name: 'Groupe quitté' })).groupId;
  await joinAs(w.bea.id, leftGroupId, 'LEFT');
  hiddenGroupId = (await createGroup(admin, { name: 'Groupe masqué' })).groupId;
  await joinAs(w.bea.id, hiddenGroupId, 'ACTIVE');
  await prisma.group.update({
    where: { id: hiddenGroupId },
    data: { hiddenByDeveloperAt: new Date() },
  });
  closedGroupId = (await createGroup(admin, { name: 'Groupe fermé' })).groupId;
  await joinAs(w.bea.id, closedGroupId, 'ACTIVE');
  await prisma.group.update({ where: { id: closedGroupId }, data: { status: 'CLOSED' } });
});

describe('GET /v1/me/summary', () => {
  it('lists the groups I am in now, with the figures of each group', async () => {
    const res = await stageApi(w.bea).get('/v1/me/summary');
    expect(res.status).toBe(200);
    const { groups } = combinedSummarySchema.parse(res.body);
    expect(groups.map((g) => g.groupId).sort()).toEqual([w.groupId, formingGroupId].sort());

    const njangi = groups.find((g) => g.groupId === w.groupId)!;
    expect(njangi).toMatchObject({
      name: 'Njangi du quartier',
      role: 'MEMBER',
      status: 'ACTIVE',
      myDue: 11_000,
      available: 0,
      openVotes: 1,
    });
    // Unread messages are the group's own figure (Carl's message and any system line count).
    const chat = await stageApi(w.bea).get(`/v1/groups/${w.groupId}/chat`);
    expect(njangi.unreadMessages).toBe(chat.body.unread);
    expect(njangi.unreadMessages).toBeGreaterThanOrEqual(1);
    expect(njangi.currentRound).toMatchObject({ number: 1, total: 2 });
    expect(Date.parse(njangi.currentRound!.dueAt)).toBeGreaterThan(Date.now());

    const forming = groups.find((g) => g.groupId === formingGroupId)!;
    expect(forming).toMatchObject({
      status: 'FORMING',
      currentRound: null,
      myDue: 0,
      available: 0,
      openVotes: 0,
    });
  });

  it('does not list a group I left, one a developer hid, or a closed one', async () => {
    const res = await stageApi(w.bea).get('/v1/me/summary');
    const ids = (res.body.groups as { groupId: string }[]).map((g) => g.groupId);
    for (const id of [leftGroupId, hiddenGroupId, closedGroupId]) expect(ids).not.toContain(id);
    expect(JSON.stringify(res.body)).not.toMatch(/Groupe (quitté|masqué|fermé)/);
  });

  it('counts the open votes a member has not cast yet', async () => {
    const res = await stageApi(w.carl).get('/v1/me/summary');
    // Carl may vote on the first only (he is the subject of the second); Dina on the second only.
    expect(res.body.groups[0]).toMatchObject({ groupId: w.groupId, openVotes: 1, myDue: 0 });
    const dina = await stageApi(w.dina).get('/v1/me/summary');
    expect(dina.body.groups[0]).toMatchObject({ groupId: w.groupId, openVotes: 1 });
  });

  it('shows a stranger only their own groups, never the figures of another group', async () => {
    const res = await stageApi(w.stranger).get('/v1/me/summary');
    expect(res.status).toBe(200);
    const body = combinedSummarySchema.parse(res.body);
    expect(body.groups.map((g) => g.groupId)).toEqual([w.strangerGroupId]);
    expect(body.groups[0]).toMatchObject({ role: 'ADMIN', myDue: 0, available: 0 });
    expect(JSON.stringify(res.body)).not.toContain('Njangi du quartier');
  });

  it('refuses an anonymous caller', async () => {
    expect((await stageApi(null).get('/v1/me/summary')).status).toBe(401);
  });
});
