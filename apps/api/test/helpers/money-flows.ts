// Shared steps for tests of money flows on the real services, ledger and mock operator: a started
// group on its own operator account, a paid first round, a passed vote, a sound-ledger check.
import { checkLedger, type LedgerTransaction } from '@njangi/rules';
import { expect } from 'vitest';
import { advanceTestClock } from '../../src/lib/clock';
import { settleBackground } from '../../src/jobs/dispatch';
import { getPrisma } from '../../src/lib/prisma';
import { pollPaymentIntent } from '../../src/modules/payments';
import { MOCK_CONFIRMATION_MS } from '../../src/modules/providers/mock-provider';
import { readChain } from '../../src/modules/statements/ledger-read';
import { api } from './client';
import { addMember, confirm, createGroup, signUp } from './factories';
import { proposalOf, vote, type Member } from './governance';

/** A group of four on its own operator account, first cycle started through the real services. */
export async function realGroup() {
  const user = await signUp();
  const created = await createGroup(user);
  const groupId = created.groupId;
  await getPrisma().group.update({
    where: { id: groupId },
    data: { providerAccount: `test-${groupId}` },
  });
  const admin: Member = { ...user, membershipId: created.adminMembershipId };
  const members: Member[] = [];
  for (let i = 0; i < 3; i += 1) members.push(await addMember(admin, groupId));
  const card = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
  expect((await confirm(admin, card.body.action.id)).status).toBe(200);
  const rounds = await getPrisma().round.findMany({
    where: { groupId },
    orderBy: { number: 'asc' },
  });
  return { groupId, admin, members, everyone: [admin, ...members], rounds };
}

/** Pays everything the member owes for round 1 and lets the operator confirm. */
export async function payRoundOne(groupId: string, member: Member): Promise<string> {
  const dues = await api(member).get(`/v1/groups/${groupId}/me/dues`);
  const obligationIds = (dues.body.dues as { id: string; roundNumber: number | null }[])
    .filter((due) => due.roundNumber === 1)
    .map((due) => due.id);
  const card = await api(member).post(`/v1/groups/${groupId}/payments`, { obligationIds });
  expect(card.status).toBe(201);
  const done = await confirm(member, card.body.action.id);
  const intentId = String(done.body.action.result.ref);
  advanceTestClock(MOCK_CONFIRMATION_MS + 1_000);
  await pollPaymentIntent(intentId);
  await settleBackground();
  return intentId;
}

export const ledgerOf = (groupId: string): Promise<LedgerTransaction[]> =>
  readChain(getPrisma(), groupId);

/** The whole ledger, after checking every invariant of spec 2.5. */
export async function expectSoundLedger(groupId: string): Promise<LedgerTransaction[]> {
  const ledger = await ledgerOf(groupId);
  expect(checkLedger(groupId, ledger)).toEqual([]);
  return ledger;
}

/** Votes yes one member at a time until the proposal has passed. */
export async function pass(voters: Member[], proposalId: string): Promise<void> {
  for (const voter of voters) {
    if ((await proposalOf(voters[0]!, proposalId)).status !== 'OPEN') break;
    await vote(voter, proposalId, 'YES');
  }
  expect((await proposalOf(voters[0]!, proposalId)).status).toBe('PASSED');
}

export const fundBalance = async (member: Member, groupId: string): Promise<number> =>
  (await api(member).get(`/v1/groups/${groupId}/solidarity`)).body.fundBalance as number;
