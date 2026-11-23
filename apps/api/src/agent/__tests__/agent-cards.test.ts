// The cards the agent prepares are the server's PendingAction, drawn under the reply they belong to
// (spec 4.5): they come back with the conversation, so a reload, a tab change or the floating chat
// never loses a card the agent said it prepared. And the member's tap never waits for the agent's
// follow-up sentence.
import { beforeAll, describe, expect, it } from 'vitest';
import { settleBackground, useJobScheduler } from '../../jobs/dispatch';
import { scheduleAt } from '../../jobs/queues';
import { getPrisma } from '../../lib/prisma';
import { recordRealtimeEvents, stopRecording } from '../../realtime/emitter';
import { api } from '../../../test/helpers/client';
import { confirm } from '../../../test/helpers/factories';
import { startedGroup, type Member } from '../../../test/helpers/governance';
import { setAgentConfigForTests } from '../config';
import { ScriptedLlm } from '../llm/scripted';
import { setLlmForTests } from '../llm/provider';
import { agentApi, scriptedAgent } from './helpers';

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

interface Line {
  id: string;
  role: string;
  text: string;
  actions: { id: string; status: string; type: string }[];
}

async function conversation(
  user: Member,
  query = '',
): Promise<{ messages: Line[]; next: string | null }> {
  const res = await agentApi(user).get(`/v1/agent/conversation${query}`);
  expect(res.status).toBe(200);
  return { messages: res.body.messages as Line[], next: res.body.nextBefore as string | null };
}

const prepareRuleChange = (fine: number) =>
  scriptedAgent([
    { toolCalls: [{ name: 'propose_rule_change', args: { changes: { lateFine: fine } } }] },
    { text: 'Je prépare la proposition : confirme-la dans la carte.' },
  ]);

/** The member asks; the scripted agent prepares the rule-change card. Fails loudly if none came. */
async function ask(user: Member, fine: number, group: string = groupId) {
  prepareRuleChange(fine);
  const res = await agentApi(user).post('/v1/agent/messages', {
    text: `Amende à ${fine}`,
    groupId: group,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  expect(res.body.turn.actions, JSON.stringify(res.body.turn.toolCalls)).toHaveLength(1);
  return res.body.turn as {
    conversationId: string;
    actions: { id: string }[];
    reply: { actions: { id: string }[] };
  };
}

describe('the conversation carries the cards of each reply', () => {
  it('returns the card under the reply that prepared it, and keeps it across reloads', async () => {
    const turn = await ask(carine, 1_500);
    const card = turn.actions[0]!;
    // The reply of the turn itself carries the same card (also what `agent.done` sends).
    expect(turn.reply.actions.map((a) => a.id)).toEqual([card.id]);

    for (let reload = 0; reload < 2; reload += 1) {
      const { messages } = await conversation(carine);
      const reply = messages.find((m) => m.role === 'assistant')!;
      expect(reply.actions).toHaveLength(1);
      expect(reply.actions[0]).toMatchObject({
        id: card.id,
        type: 'PROPOSAL_CREATE',
        status: 'PENDING',
      });
      expect(
        messages.filter((m) => m.role !== 'assistant').every((m) => m.actions.length === 0),
      ).toBe(true);
    }
  });

  it('shows the card state as it changes: cancelled after a cancel, done after a confirm', async () => {
    const world = await startedGroup(1);
    const user = world.members[0]!;
    const first = (await ask(user, 1_600, world.groupId)).actions[0]!;
    await api(user).post(`/v1/pending-actions/${first.id}/cancel`);
    const second = (await ask(user, 1_700, world.groupId)).actions[0]!;
    expect((await confirm(user, second.id)).status).toBe(200);

    const states = new Map(
      (await conversation(user)).messages.flatMap((m) => m.actions).map((a) => [a.id, a.status]),
    );
    expect(states.get(first.id)).toBe('CANCELLED');
    expect(states.get(second.id)).toBe('DONE');
  });

  it('never shows a member another member card, and leaves out args', async () => {
    const card = (await ask(admin, 1_800)).actions[0]!;
    const others = JSON.stringify((await conversation(paul)).messages);
    expect(others).not.toContain(card.id);
    const mine = (await conversation(admin)).messages.flatMap((m) => m.actions);
    expect(mine.find((a) => a.id === card.id)).toBeDefined();
    expect(JSON.stringify(mine)).not.toContain('"args"');
  });

  it('keeps each card once, on its own reply, when read page by page', async () => {
    const world = await startedGroup(1);
    const user = world.members[0]!;
    const ids: string[] = [];
    for (const fine of [1_100, 1_200, 1_300]) {
      ids.push((await ask(user, fine, world.groupId)).actions[0]!.id);
    }
    // A page of one line cuts every turn between the member line and the reply.
    const seen: string[] = [];
    let query = '?limit=1';
    for (let guard = 0; guard < 8; guard += 1) {
      const page = await conversation(user, query);
      seen.push(...page.messages.flatMap((m) => m.actions).map((a) => a.id));
      if (!page.next) break;
      query = `?limit=1&before=${encodeURIComponent(page.next)}`;
    }
    expect([...seen].sort()).toEqual([...ids].sort());
  });

  it('puts a card the member can still tap on the newest reply even if no stored line names it', async () => {
    // A secret ballot turn keeps no link to its card (R11.5): the open card still has to be there.
    const world = await startedGroup(1);
    const user = world.members[0]!;
    const turn = await ask(user, 1_900, world.groupId);
    const card = turn.actions[0]!;
    await getPrisma().agentMessage.updateMany({
      where: { conversationId: turn.conversationId, content: { contains: card.id } },
      data: { content: '' },
    });
    const { messages } = await conversation(user);
    const newest = [...messages].reverse().find((m) => m.role === 'assistant')!;
    expect(newest.actions.map((a) => a.id)).toContain(card.id);
    // Once the member has answered it, it is no longer open: nothing is attached any more.
    await api(user).post(`/v1/pending-actions/${card.id}/cancel`);
    const after = (await conversation(user)).messages.flatMap((m) => m.actions);
    expect(after.map((a) => a.id)).not.toContain(card.id);
  });

  it('sends the reply with its cards in `agent.done`', async () => {
    const events = recordRealtimeEvents();
    const turn = await ask(carine, 2_000);
    stopRecording(events);
    const done = events.find((e) => e.event === 'agent.done')!;
    expect(done.room).toBe(`user:${carine.id}`);
    const payload = done.payload as { reply: { actions: { id: string }[] } };
    expect(payload.reply.actions.map((a) => a.id)).toEqual([turn.actions[0]!.id]);
  });
});

describe('the tap does not wait for the agent', () => {
  it('answers the confirm before the agent has written its follow-up sentence', async () => {
    useJobScheduler(scheduleAt);
    try {
      const world = await startedGroup(1);
      const user = world.members[0]!;
      const sentence = 'C’est fait : la proposition est ouverte au vote.';
      const delayMs = 1_500;
      const llm = new ScriptedLlm([
        { toolCalls: [{ name: 'propose_rule_change', args: { changes: { lateFine: 2_100 } } }] },
        { text: 'Je prépare la proposition.' },
        { text: sentence },
      ]);
      const slow = {
        name: 'slow',
        chat: async (...args: Parameters<ScriptedLlm['chat']>) => {
          // The first two calls belong to the member message; only the follow-up is slow.
          if (llm.requests.length >= 2) await new Promise((r) => setTimeout(r, delayMs));
          return llm.chat(...args);
        },
      };
      setAgentConfigForTests({
        configured: true,
        apiKey: 'test-only',
        model: 'test/model',
        toolRouting: false,
      });
      setLlmForTests(slow);
      const sent = await agentApi(user).post('/v1/agent/messages', {
        text: 'Amende à 2 100',
        groupId: world.groupId,
      });
      const card = sent.body.turn.actions[0];

      const started = Date.now();
      const res = await api(user).post(`/v1/pending-actions/${card.id}/confirm`, {});
      const tookMs = Date.now() - started;
      expect(res.status).toBe(200);
      console.info(
        `[timing] confirm answered in ${tookMs} ms (follow-up model call: ${delayMs} ms)`,
      );
      // Had the request waited for the follow-up it would have taken at least the model time.
      expect(tookMs).toBeLessThan(delayMs);

      // The sentence still arrives, after the response.
      let lines: Line[] = [];
      for (let i = 0; i < 80 && !lines.some((m) => m.text === sentence); i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        lines = (await conversation(user)).messages;
      }
      expect(lines.map((m) => m.role).slice(-2)).toEqual(['event', 'assistant']);
      expect(lines.at(-1)!.text).toBe(sentence);
      expect(lines.filter((m) => m.role === 'event')).toHaveLength(1);
    } finally {
      useJobScheduler(null);
      await settleBackground();
      await getPrisma()
        .$executeRaw`DELETE FROM "DeploymentJob" WHERE "name" = 'agent.actionResult'`;
    }
  });
});
