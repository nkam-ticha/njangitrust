// The agent's money tools on the real money services (spec 4.5, 4.6): the agent reads through the
// services as the member, prepares cards the member confirms, and never moves money itself.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { advanceTestClock, resetTestClock } from '../../lib/clock';
import { settleBackground } from '../../jobs/dispatch';
import { getPrisma } from '../../lib/prisma';
import { pollPaymentIntent } from '../../modules/payments';
import { MOCK_CONFIRMATION_MS } from '../../modules/providers/mock-provider';
import { api, type TestUser } from '../../../test/helpers/client';
import { addMember, confirm, createGroup, signUp } from '../../../test/helpers/factories';
import { registerAgentAdapters } from '../adapters';
import { agentApi, agentApp, scriptedAgent } from './helpers';

type Member = TestUser & { membershipId: string };

let groupId: string;
let admin: Member;
let paul: Member;
let carine: Member;
let roundId: string;

const say = (member: Member, text: string) =>
  agentApi(member).post('/v1/agent/messages', { text, groupId });

const contributionOf = (member: Member) =>
  getPrisma().obligation.findFirstOrThrow({
    where: { roundId, membershipId: member.membershipId, kind: 'CONTRIBUTION' },
  });

beforeAll(async () => {
  agentApp();
  const user = await signUp();
  const created = await createGroup(user);
  groupId = created.groupId;
  admin = { ...user, membershipId: created.adminMembershipId };
  paul = await addMember(admin, groupId);
  carine = await addMember(admin, groupId);
  const card = await api(admin).post(`/v1/groups/${groupId}/cycles/start`);
  expect((await confirm(admin, card.body.action.id)).status).toBe(200);
  const round = await getPrisma().round.findFirstOrThrow({ where: { groupId, number: 1 } });
  roundId = round.id;
});

// The shared helpers clear the ports after each test: register the real ones again.
beforeEach(() => registerAgentAdapters());

describe('reading money through the agent', () => {
  it('announces the money capability and puts the round in the session block', async () => {
    const status = await agentApi(paul).get('/v1/agent/status');
    expect(status.body.capabilities).toMatchObject({ money: true, cycles: true });
    const llm = scriptedAgent([{ text: 'Bonjour.' }]);
    expect((await say(paul, 'Bonjour')).status).toBe(200);
    const sent = llm.bodyTexts()[0]!;
    expect(sent).toMatch(/cycle 1, tour 1/);
    expect(sent).toMatch(/à payer/);
  });

  it('answers what the member owes, the round, who has not paid and the funds', async () => {
    const llm = scriptedAgent([
      {
        toolCalls: [
          { name: 'get_my_overview' },
          { name: 'get_round' },
          { name: 'list_unpaid' },
          { name: 'get_funds' },
        ],
      },
      { text: 'Voilà.' },
    ]);
    const res = await say(paul, 'Je dois combien, et qui n’a pas payé ?');
    expect(res.status).toBe(200);
    expect(res.body.turn.toolCalls).toEqual([
      { name: 'get_my_overview', status: 'OK' },
      { name: 'get_round', status: 'OK' },
      { name: 'list_unpaid', status: 'OK' },
      { name: 'get_funds', status: 'OK' },
    ]);
    const results = llm.bodyTexts()[1]!;
    const owed = (await contributionOf(paul)).amount;
    // Amounts reach the model already formatted, never as bare integers to recompute.
    expect(results).toContain('FCFA');
    expect(results).not.toContain(`"amount":${owed}`);
    expect(results).toContain(carine.name);
    expect(results).toContain('1/3'.replace('1', '0'));
    // No phone number of anyone, and no internal ids of other members.
    expect(results).not.toContain(carine.phone.slice(-9));
    expect(results).not.toContain(admin.phone.slice(-9));
    expect(results).not.toContain(carine.membershipId);
  });

  it('refuses another group’s data: the tools only see the member’s active group', async () => {
    const outsider = await signUp();
    await createGroup(outsider);
    scriptedAgent([{ toolCalls: [{ name: 'get_round' }] }, { text: 'Non.' }]);
    const res = await agentApi(outsider).post('/v1/agent/messages', { text: 'Tour ?', groupId });
    // Not a member of that group: the turn is refused before any tool runs.
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('acting on money through the agent', () => {
  it('prepares the payment card; only the member’s confirmation starts the payment', async () => {
    const before = await contributionOf(paul);
    const llm = scriptedAgent([
      { toolCalls: [{ name: 'pay' }] },
      { text: 'La carte est prête, confirme dans l’application.' },
    ]);
    const res = await say(paul, 'Paie ma cotisation');
    expect(res.status).toBe(200);
    expect(res.body.turn.toolCalls).toEqual([{ name: 'pay', status: 'OK' }]);
    const [action] = res.body.turn.actions as { id: string; status: string; origin?: string }[];
    expect(action).toBeDefined();
    const row = await getPrisma().pendingAction.findUniqueOrThrow({ where: { id: action!.id } });
    expect(row).toMatchObject({ type: 'PAY', origin: 'AGENT', status: 'PENDING', userId: paul.id });
    // The model was told the card, not asked to confirm; nothing is paid, no intent exists.
    expect(llm.bodyTexts()[1]).toContain(action!.id);
    expect((await contributionOf(paul)).status).toBe('DUE');
    expect(
      await getPrisma().paymentIntent.count({ where: { membershipId: paul.membershipId } }),
    ).toBe(0);
    // Another member cannot confirm it.
    expect((await confirm(carine, action!.id)).status).toBeGreaterThanOrEqual(400);

    const done = await confirm(paul, action!.id);
    expect(done.status).toBe(200);
    const intentId = String(done.body.action.result.ref);
    advanceTestClock(MOCK_CONFIRMATION_MS + 1_000);
    await pollPaymentIntent(intentId);
    await settleBackground();
    resetTestClock();
    const paid = await contributionOf(paul);
    expect(paid.status).toBe('PAID');
    expect(paid.amount).toBe(before.amount);
  });

  it('says so when there is nothing left to pay or to withdraw', async () => {
    scriptedAgent([
      { toolCalls: [{ name: 'pay' }, { name: 'withdraw', args: { all: true } }] },
      { text: 'Rien à faire.' },
    ]);
    const res = await say(paul, 'Paie encore et retire tout');
    expect(res.status).toBe(200);
    const calls = res.body.turn.toolCalls as { name: string; status: string }[];
    expect(calls.map((c) => c.name)).toEqual(['pay', 'withdraw']);
    expect(calls.every((c) => c.status !== 'OK')).toBe(true);
    expect(res.body.turn.actions).toEqual([]);
  });

  it('prepares a loan request card and never a decision for a simple member', async () => {
    const llm = scriptedAgent([
      { toolCalls: [{ name: 'get_loan_quote', args: { amount: 5_000, months: 1 } }] },
      { text: 'Voici.' },
    ]);
    const res = await say(carine, 'Je peux emprunter 5 000 ?');
    expect(res.status).toBe(200);
    expect(res.body.turn.toolCalls[0]).toMatchObject({ name: 'get_loan_quote' });
    expect(llm.requests[0]!.tools.map((t) => t.name)).not.toContain('decide_loan');
  });
});
