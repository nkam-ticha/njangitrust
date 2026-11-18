// Spec 2.7 Agent, 4.2, 4.5, 4.10: the agent through its REST routes, with a scripted model.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { settleBackground } from '../../jobs/dispatch';
import { getPrisma } from '../../lib/prisma';
import { recordRealtimeEvents, stopRecording } from '../../realtime/emitter';
import { api } from '../../../test/helpers/client';
import { confirm, createGroup, signUp } from '../../../test/helpers/factories';
import { startedGroup, type Member } from '../../../test/helpers/governance';
import { agentMessageLimiter } from '../guards/rate-limit';
import { withTurnLease } from '../guards/turn-lease';
import { onPendingActionUpdated } from '../service/events';
import { agentApi, agentApp, scriptedAgent, unconfiguredAgent } from './helpers';

let groupId: string;
let admin: Member;
let paul: Member;
let carine: Member;

beforeAll(async () => {
  const world = await startedGroup(2);
  groupId = world.groupId;
  admin = world.admin;
  [paul, carine] = world.members as [Member, Member];
});

describe('when OPENROUTER_API_KEY is missing', () => {
  it('answers a clear bilingual "not configured" and the rest keeps working', async () => {
    unconfiguredAgent();
    const res = await agentApi(paul).post('/v1/agent/messages', { text: 'Bonjour', groupId });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'AGENT_NOT_CONFIGURED' });
    expect(res.body.messageFr).toMatch(/pas encore activé/);
    expect(res.body.messageEn).toMatch(/not switched on/);
    const status = await agentApi(paul).get('/v1/agent/status');
    expect(status.body).toMatchObject({ configured: false, capabilities: { money: true } });
    expect((await agentApi(paul).get('/v1/agent/history')).status).toBe(200);
    expect((await api(paul).get(`/v1/groups/${groupId}/members`)).status).toBe(200);
  });
});

describe('a private turn', () => {
  it('reads through the services as the member, streams to their room and stores the turn', async () => {
    const events = recordRealtimeEvents();
    const llm = scriptedAgent([
      { toolCalls: [{ name: 'list_members' }] },
      { text: 'Le groupe compte 3 membres.' },
    ]);
    const res = await agentApi(paul).post('/v1/agent/messages', {
      text: 'Qui est dans le groupe ?',
      groupId,
    });
    stopRecording(events);
    expect(res.status).toBe(200);
    expect(res.body.turn.reply).toMatchObject({
      role: 'assistant',
      text: 'Le groupe compte 3 membres.',
    });
    expect(res.body.turn.toolCalls).toEqual([{ name: 'list_members', status: 'OK' }]);
    expect(llm.bodyTexts()[1]).toContain(paul.name);
    const mine = events.filter((e) => e.event.startsWith('agent.'));
    expect(mine.map((e) => e.event)).toEqual(
      expect.arrayContaining(['agent.activity', 'agent.delta', 'agent.done']),
    );
    expect(new Set(mine.map((e) => e.room))).toEqual(new Set([`user:${paul.id}`]));
    const history = await agentApi(paul).get('/v1/agent/history');
    expect(history.body.items[0]).toMatchObject({ tool: 'list_members', status: 'looked' });
    const conversation = await agentApi(paul).get('/v1/agent/conversation');
    expect(conversation.body.messages.map((m: { role: string }) => m.role)).toEqual([
      'user',
      'assistant',
    ]);
  });

  it('never sends admin-only tools to a member', async () => {
    const llm = scriptedAgent([{ text: 'Non.' }]);
    await agentApi(paul).post('/v1/agent/messages', { text: 'Démarre le cycle', groupId });
    const names = llm.requests[0]!.tools.map((t) => t.name);
    expect(names).not.toContain('start_cycle');
    expect(names).not.toContain('create_invite');
    const asAdmin = scriptedAgent([{ text: 'Ok.' }]);
    await agentApi(admin).post('/v1/agent/messages', { text: 'Démarre le cycle', groupId });
    expect(asAdmin.requests[0]!.tools.map((t) => t.name)).toContain('start_cycle');
  });

  it('explains what is not built yet with a typed UNAVAILABLE', async () => {
    const llm = scriptedAgent([
      { toolCalls: [{ name: 'get_my_overview' }] },
      { text: 'Pas encore.' },
    ]);
    const res = await agentApi(paul).post('/v1/agent/messages', {
      text: 'Je dois combien ?',
      groupId,
    });
    expect(res.body.turn.toolCalls).toEqual([{ name: 'get_my_overview', status: 'REFUSED' }]);
    expect(llm.bodyTexts()[1]).toContain('UNAVAILABLE');
  });

  it('keeps another member out of a conversation and of the agent history', async () => {
    scriptedAgent([{ text: 'Bonjour Paul.' }]);
    const res = await agentApi(paul).post('/v1/agent/messages', { text: 'Bonjour', groupId });
    const conversationId = res.body.turn.conversationId as string;
    expect((await agentApi(carine).get(`/v1/agent/conversations/${conversationId}`)).status).toBe(
      404,
    );
    expect((await agentApi(paul).get(`/v1/agent/conversations/${conversationId}`)).status).toBe(
      200,
    );
    // The admin is no exception (spec 4.10).
    expect((await agentApi(admin).get(`/v1/agent/conversations/${conversationId}`)).status).toBe(
      404,
    );
    const mine = await agentApi(paul).get('/v1/agent/history');
    for (const other of [carine, admin]) {
      const theirs = await agentApi(other).get('/v1/agent/history');
      expect(JSON.stringify(theirs.body)).not.toContain(conversationId);
      const ids = new Set((theirs.body.items as { id: string }[]).map((i) => i.id));
      for (const item of mine.body.items as { id: string }[]) expect(ids.has(item.id)).toBe(false);
      const conversation = await agentApi(other).get('/v1/agent/conversation');
      expect(JSON.stringify(conversation.body)).not.toContain('Bonjour Paul.');
    }
  });

  it('refuses every route without a session', async () => {
    for (const path of ['/v1/agent/status', '/v1/agent/conversation', '/v1/agent/history']) {
      expect((await request(agentApp()).get(path)).status).toBe(401);
    }
    const res = await request(agentApp()).post('/v1/agent/messages').send({ text: 'Bonjour' });
    expect(res.status).toBe(401);
  });

  it('has no route that confirms a pending action, and no trace route', async () => {
    scriptedAgent([{ text: 'x' }]);
    const id = randomUUID();
    for (const path of [
      `/v1/agent/pending-actions/${id}/confirm`,
      `/v1/agent/actions/${id}/confirm`,
      '/v1/agent/confirm',
    ]) {
      expect((await agentApi(paul).post(path, {})).status).toBe(404);
    }
    expect((await agentApi(paul).get(`/v1/agent/turns/${id}/trace`)).status).toBe(404);
  });

  it('refuses a second turn of the same member while one is running, on any instance', async () => {
    scriptedAgent(() => ({ text: 'Oui.' }));
    // Another serverless instance holds this member's turn lease.
    const answer = await withTurnLease(paul.id, () =>
      withTurnLease(paul.id, () => Promise.resolve('ran'), { waitMs: 300 }).catch(
        (error: { code?: string }) => error.code,
      ),
    );
    expect(answer).toBe('AGENT_BUSY');
    const res = await agentApi(paul).post('/v1/agent/messages', { text: 'Bonjour', groupId });
    expect(res.status).toBe(200);
  });

  it('refuses a group the member does not belong to', async () => {
    const outsider = await signUp();
    const other = await createGroup(outsider, { name: 'Autre njangi' });
    scriptedAgent([{ text: 'x' }]);
    const res = await agentApi(paul).post('/v1/agent/messages', {
      text: 'Bonjour',
      groupId: other.groupId,
    });
    expect(res.status).toBe(404);
  });
});

describe('the confirmation protocol (spec 4.5)', () => {
  it('prepares a card, returns only its id and summary to the model, and reports the result as an event', async () => {
    const llm = scriptedAgent([
      { toolCalls: [{ name: 'propose_rule_change', args: { changes: { lateFine: 1_500 } } }] },
      { text: 'Je prépare la proposition : confirme-la dans la carte.' },
      { text: 'C’est fait : la proposition est ouverte au vote.' },
    ]);
    const res = await agentApi(carine).post('/v1/agent/messages', {
      text: 'Passe l’amende à 1 500',
      groupId,
    });
    expect(res.body.turn.actions).toHaveLength(1);
    const action = res.body.turn.actions[0];
    expect(action).toMatchObject({ type: 'PROPOSAL_CREATE', status: 'PENDING', origin: 'AGENT' });
    const toolMessage = JSON.parse(
      String(llm.bodies[1]!.messages.find((m) => m.role === 'tool')!.content).split('\n')[1]!,
    );
    expect(Object.keys(toolMessage).sort()).toEqual(['pendingActionId', 'status', 'summary']);
    expect((await agentApi(carine).get('/v1/agent/history')).body.items[0].status).toBe('prepared');

    const events = recordRealtimeEvents();
    expect((await confirm(carine, action.id)).status).toBe(200);
    stopRecording(events);
    // The wiring: every pendingAction.updated reaches the agent (WIRING LIST item 3).
    for (const e of events.filter((x) => x.event === 'pendingAction.updated')) {
      await onPendingActionUpdated(carine.id, e.payload as never);
    }
    await settleBackground();
    const lines = (await agentApi(carine).get('/v1/agent/conversation')).body.messages as {
      role: string;
      text: string;
    }[];
    expect(lines.map((m) => m.role)).toEqual(['user', 'assistant', 'event', 'assistant']);
    expect(lines[2]!.text).toMatch(/Amende de retard/);
    expect(String(llm.bodies[2]!.messages.at(-1)!.content)).toMatch(
      /^<event type="action_result" status="DONE">/,
    );
    expect((await agentApi(carine).get('/v1/agent/history')).body.items[0].status).toBe('done');
  });
});

describe('rate limits (spec 4.2)', () => {
  it('allows 30 messages in 10 minutes, then answers 429 with the time to come back', async () => {
    scriptedAgent(() => ({ text: 'Oui.' }));
    for (let i = 0; i < 29; i += 1) await agentMessageLimiter.get().consume(paul.id);
    expect(
      (await agentApi(paul).post('/v1/agent/messages', { text: 'Encore', groupId })).status,
    ).toBe(200);
    const res = await agentApi(paul).post('/v1/agent/messages', { text: 'Encore', groupId });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('AGENT_RATE_LIMITED');
    expect(res.body.messageFr).toMatch(/à \d{2}:\d{2}/);
    expect(res.body.messageEn).toMatch(/at \d{1,2}:\d{2} (am|pm)/);
  });
});

describe('storage (spec 4.8 point 7)', () => {
  it('stores no phone number, even one the member typed, in messages, arguments or audit', async () => {
    scriptedAgent([
      {
        toolCalls: [
          { name: 'propose_member_add', args: { name: 'Hervé Kamga', phone: '655 44 33 22' } },
        ],
      },
      { text: 'Je prépare la proposition pour Hervé Kamga.' },
    ]);
    const res = await agentApi(admin).post('/v1/agent/messages', {
      text: 'Ajoute Hervé Kamga, son numéro est 655 44 33 22',
      groupId,
    });
    expect(res.status).toBe(200);
    const rows = await getPrisma().agentMessage.findMany({
      where: { conversation: { userId: admin.id } },
    });
    expect(JSON.stringify(rows)).not.toMatch(/655 ?44|655443322/);
    const audits = await getPrisma().auditLog.findMany({
      where: { actorUserId: admin.id, action: 'agent.tool' },
    });
    expect(audits.length).toBeGreaterThan(0);
    expect(JSON.stringify(audits)).not.toMatch(/655 ?44|655443322/);
  });
});
