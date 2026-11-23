// Each group has its own private conversation with the agent: its own lines, rolling summary,
// cards and context. Switching group switches the thread; nothing said in one group reaches the
// model, or the screen, of another.
import { describe, expect, it } from 'vitest';
import { getPrisma } from '../../lib/prisma';
import { createGroup } from '../../../test/helpers/factories';
import { startedGroup } from '../../../test/helpers/governance';
import type { ScriptFn } from '../llm/scripted';
import { agentApi, scriptedAgent } from './helpers';

interface Line {
  role: string;
  text: string;
  actions: { id: string }[];
}

const answer: ScriptFn = () => ({ text: 'Bien noté.' });

/** A member of group A who also created group B. */
async function memberOfTwoGroups() {
  const world = await startedGroup(1);
  const member = world.members[0]!;
  const second = await createGroup(member);
  return { member, groupA: world.groupId, groupB: second.groupId };
}

async function lines(
  api: ReturnType<typeof agentApi>,
  query: string,
): Promise<{ messages: Line[]; groupId: string | null }> {
  const res = await api.get(`/v1/agent/conversation${query}`);
  expect(res.status).toBe(200);
  return {
    messages: res.body.messages as Line[],
    groupId: (res.body.conversation?.groupId ?? null) as string | null,
  };
}

describe('one private conversation per group', () => {
  it('keeps the lines of each group in its own conversation', async () => {
    const { member, groupA, groupB } = await memberOfTwoGroups();
    const api = agentApi(member);
    scriptedAgent(answer);

    expect(
      (await api.post('/v1/agent/messages', { text: 'Message alpha', groupId: groupA })).status,
    ).toBe(200);
    expect(
      (await api.post('/v1/agent/messages', { text: 'Message beta', groupId: groupB })).status,
    ).toBe(200);

    const a = await lines(api, `?groupId=${groupA}`);
    const b = await lines(api, `?groupId=${groupB}`);
    expect(a.groupId).toBe(groupA);
    expect(b.groupId).toBe(groupB);
    expect(a.messages.map((m) => m.text)).toContain('Message alpha');
    expect(a.messages.map((m) => m.text)).not.toContain('Message beta');
    expect(b.messages.map((m) => m.text)).toContain('Message beta');
    expect(b.messages.map((m) => m.text)).not.toContain('Message alpha');

    const rows = await getPrisma().agentConversation.findMany({
      where: { userId: member.id, channel: 'PRIVATE' },
    });
    expect(rows.map((r) => r.groupId).sort()).toEqual([groupA, groupB].sort());
  });

  it('never sends one group’s history to the model while talking in another', async () => {
    const { member, groupA, groupB } = await memberOfTwoGroups();
    const api = agentApi(member);
    const llm = scriptedAgent(answer);

    await api.post('/v1/agent/messages', { text: 'Secret alpha topic', groupId: groupA });
    await api.post('/v1/agent/messages', { text: 'Question beta', groupId: groupB });
    const lastBeta = llm.bodyTexts().at(-1)!;
    expect(lastBeta).toContain('Question beta');
    expect(lastBeta).not.toContain('Secret alpha topic');

    // Back in group A, its own earlier line is remembered and group B's is not.
    await api.post('/v1/agent/messages', { text: 'Retour alpha', groupId: groupA });
    const backInAlpha = llm.bodyTexts().at(-1)!;
    expect(backInAlpha).toContain('Secret alpha topic');
    expect(backInAlpha).not.toContain('Question beta');
  });

  it('answers a message with no group in the thread used last', async () => {
    const { member, groupA, groupB } = await memberOfTwoGroups();
    const api = agentApi(member);
    scriptedAgent(answer);

    await api.post('/v1/agent/messages', { text: 'Dans alpha', groupId: groupA });
    await api.post('/v1/agent/messages', { text: 'Dans beta', groupId: groupB });
    await api.post('/v1/agent/messages', { text: 'Sans groupe' });

    expect((await lines(api, `?groupId=${groupB}`)).messages.map((m) => m.text)).toContain(
      'Sans groupe',
    );
    expect((await lines(api, `?groupId=${groupA}`)).messages.map((m) => m.text)).not.toContain(
      'Sans groupe',
    );
    // With no group asked for, the conversation read is the one used last.
    expect((await lines(api, '')).groupId).toBe(groupB);
  });

  it('keeps a card in the group it was prepared for', async () => {
    const { member, groupA, groupB } = await memberOfTwoGroups();
    const api = agentApi(member);
    scriptedAgent((_request, call) =>
      call === 0
        ? { toolCalls: [{ name: 'propose_rule_change', args: { changes: { lateFine: 700 } } }] }
        : { text: 'La carte est prête.' },
    );
    await api.post('/v1/agent/messages', { text: 'Propose une amende de 700', groupId: groupA });
    scriptedAgent(answer);
    await api.post('/v1/agent/messages', { text: 'Bonjour', groupId: groupB });

    const inA = (await lines(api, `?groupId=${groupA}`)).messages.flatMap((m) => m.actions);
    const inB = (await lines(api, `?groupId=${groupB}`)).messages.flatMap((m) => m.actions);
    expect(inA.length).toBeGreaterThan(0);
    expect(inB).toHaveLength(0);
  });

  it('has a group that was never talked about start empty', async () => {
    const { member, groupB } = await memberOfTwoGroups();
    const read = await lines(agentApi(member), `?groupId=${groupB}`);
    expect(read.messages).toEqual([]);
    expect(read.groupId).toBeNull();
  });
});
