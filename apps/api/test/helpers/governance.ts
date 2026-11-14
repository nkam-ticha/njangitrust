// Shared steps for governance tests: a started group, proposing, voting.
import { settleBackground } from '../../src/jobs/dispatch';
import { getPrisma } from '../../src/lib/prisma';
import { settleProposal } from '../../src/modules/proposals/proposals.tally';
import { api, type TestUser } from './client';
import { addMember, confirm, createGroup, markFirstCycleStarted, signUp } from './factories';

export type Member = TestUser & { membershipId: string };

/** An admin and `others` members, first cycle started. */
export async function startedGroup(
  others = 3,
): Promise<{ groupId: string; admin: Member; members: Member[] }> {
  const admin = await signUp();
  const { groupId, adminMembershipId } = await createGroup(admin);
  const members: Member[] = [];
  for (let i = 0; i < others; i += 1) members.push(await addMember(admin, groupId));
  await markFirstCycleStarted(groupId);
  return { groupId, admin: { ...admin, membershipId: adminMembershipId }, members };
}

/** Prepares and confirms a proposal; returns its id (or throws with the refusal). */
export async function propose(
  user: TestUser,
  groupId: string,
  body: Record<string, unknown>,
): Promise<string> {
  const card = await api(user).post(`/v1/groups/${groupId}/proposals`, body);
  if (card.status !== 201)
    throw new Error(`proposal refused: ${card.status} ${JSON.stringify(card.body)}`);
  const done = await confirm(user, card.body.action.id);
  if (done.status !== 200)
    throw new Error(`proposal not opened: ${done.status} ${JSON.stringify(done.body)}`);
  return String(done.body.action.result.ref);
}

/** Casts a vote (card + confirm). A public vote is re-tallied before this returns; a secret one
 * closes only at its deadline (`closeAtDeadline`). */
export async function vote(user: TestUser, proposalId: string, choice: 'YES' | 'NO') {
  const card = await api(user).post(`/v1/proposals/${proposalId}/votes`, { choice });
  if (card.status !== 201) return card;
  return confirm(user, card.body.action.id);
}

export async function proposalOf(user: TestUser, proposalId: string) {
  return (await api(user).get(`/v1/proposals/${proposalId}`)).body.proposal;
}

/**
 * Runs the `votes.close` job at the proposal's deadline (D20.1: a secret proposal closes only
 * then). `afterMs` mimics a job that runs a little late.
 */
export async function closeAtDeadline(proposalId: string, afterMs = 37_000): Promise<string> {
  const { closesAt } = await getPrisma().proposal.findUniqueOrThrow({
    where: { id: proposalId },
    select: { closesAt: true },
  });
  const status = await settleProposal(proposalId, new Date(closesAt.getTime() + afterMs));
  await settleBackground();
  return status;
}
