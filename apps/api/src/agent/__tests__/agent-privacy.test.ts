// Spec 4.4, 4.8, R11.5, AC-06, AC-07: secret votes through the agent, the group channel, and the
// agent's events reaching only the member's own sockets.
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { settleBackground } from '../../jobs/dispatch';
import { getPrisma } from '../../lib/prisma';
import { attachRealtimeServer } from '../../realtime/emitter';
import { createRealtimeServer } from '../../realtime/socket-server';
import { installFakeMoney, uninstallFakeMoney } from '../../../test/helpers/fake-money-port';
import { propose, startedGroup, vote, type Member } from '../../../test/helpers/governance';
import { registerAgentPorts, type AgentChatPort } from '../ports';
import { onGroupMention } from '../service/group';
import { agentApi, agentApp, scriptedAgent } from './helpers';

let groupId: string;
let members: Member[];
let target: Member;

beforeAll(async () => {
  installFakeMoney();
  const world = await startedGroup(4);
  groupId = world.groupId;
  members = world.members;
  target = members[3]!;
});
afterAll(() => uninstallFakeMoney());

describe('a secret vote through the agent (R11.5, AC-07)', () => {
  it('shows only participation, takes no choice in the chat and keeps no trace of it', async () => {
    const [proposer, voter] = members as [Member, Member];
    const proposalId = await propose(proposer, groupId, {
      type: 'MEMBER_REMOVE',
      membershipId: target.membershipId,
      reason: 'Absences répétées',
    });
    const llm = scriptedAgent([
      { toolCalls: [{ name: 'list_proposals', args: { status: 'OPEN' } }] },
      { toolCalls: [{ name: 'cast_vote', args: { proposalId, choice: 'no' } }] },
      { text: 'Ce vote est secret : vote depuis l’onglet Votes.' },
    ]);
    const res = await agentApi(voter).post('/v1/agent/messages', {
      text: 'Je vote contre l’exclusion, mets non',
      groupId,
    });
    expect(res.status).toBe(200);
    const listed = llm.bodyTexts()[1]!;
    expect(listed).toContain('participation');
    expect(listed).not.toMatch(/\\"yes\\":|\\"votes\\":/);

    // No card is prepared: the choice is made on the vote screen, never through the model.
    expect(res.body.turn.actions).toEqual([]);
    expect(llm.bodyTexts()[2]!).toContain('secretVote');
    expect(
      await getPrisma().pendingAction.count({ where: { userId: voter.id, type: 'VOTE_CAST' } }),
    ).toBe(0);
    expect(await getPrisma().voteReceipt.count({ where: { proposalId } })).toBe(0);

    const rows = await getPrisma().agentMessage.findMany({
      where: { conversation: { userId: voter.id } },
    });
    const stored = JSON.stringify(rows);
    expect(stored).not.toMatch(/contre|mets non|"no"|NO"|choice/);
    const audits = await getPrisma().auditLog.findMany({
      where: { actorUserId: voter.id, action: { startsWith: 'agent.' } },
    });
    expect(JSON.stringify(audits)).not.toMatch(/choice|"no"|proposalId/);
  });

  it('still lets the member vote on the screen, where the choice never meets the model', async () => {
    const voter = members[1]!;
    const proposalId = await propose(members[0]!, groupId, {
      type: 'MEMBER_REMOVE',
      membershipId: members[2]!.membershipId,
      reason: 'Autre cas',
    });
    expect((await vote(voter, proposalId, 'NO')).status).toBe(200);
  });
});

describe('the group channel (spec 4.4)', () => {
  const posted: { text: string }[] = [];
  const chat = (text: string): AgentChatPort =>
    ({
      mentionText: () => Promise.resolve(text),
      postAgentReply: (input: { text: string }) => {
        posted.push(input);
        return Promise.resolve();
      },
    }) as unknown as AgentChatPort;
  const mention = (m: Member) => ({
    groupId,
    messageId: randomUUID(),
    authorUserId: m.id,
    authorMembershipId: m.membershipId,
  });

  it('answers a personal question privately and says so in the group', async () => {
    const asker = members[1]!;
    registerAgentPorts({ chat: chat('@njangi combien j’ai de dettes ?') });
    const llm = scriptedAgent([{ text: 'Je regarde ta situation ici, en privé.' }]);
    await onGroupMention(mention(asker));
    await settleBackground();
    const first = asker.name.split(' ')[0]!;
    expect(posted.at(-1)!.text).toBe(`Je t’ai répondu en privé, ${first}.`);
    // Only the private turn reached the model, with the private tools.
    expect(llm.requests).toHaveLength(1);
    expect(llm.requests[0]!.tools.map((t) => t.name)).toContain('get_my_overview');
    const lines = (await agentApi(asker).get('/v1/agent/conversation')).body.messages;
    expect(lines.at(-2)).toMatchObject({ role: 'user', fromGroup: true });
    expect(lines.at(-1)).toMatchObject({
      role: 'assistant',
      text: 'Je regarde ta situation ici, en privé.',
    });
  });

  it('answers a group question in the group with group-visible reading tools only', async () => {
    registerAgentPorts({ chat: chat('@njangi qui est dans le groupe ?') });
    const llm = scriptedAgent([
      { toolCalls: [{ name: 'list_members' }] },
      { text: 'Le groupe compte 5 membres.' },
    ]);
    await onGroupMention(mention(members[2]!));
    await settleBackground();
    expect(posted.at(-1)!.text).toBe('Le groupe compte 5 membres.');
    const offered = llm.requests[0]!.tools.map((t) => t.name);
    expect(offered).not.toEqual(expect.arrayContaining(['cast_vote']));
    for (const name of ['get_my_overview', 'pay', 'propose_rule_change', 'search_chat']) {
      expect(offered).not.toContain(name);
    }
    expect(llm.bodyTexts()[0]).toContain('channel: GROUP');
  });

  it('hands off when the model calls reply_privately', async () => {
    const asker = members[0]!;
    registerAgentPorts({ chat: chat('@njangi et pour moi alors ?') });
    scriptedAgent([
      { toolCalls: [{ name: 'reply_privately' }] },
      { text: 'Voici ta réponse en privé.' },
    ]);
    await onGroupMention(mention(asker));
    await settleBackground();
    expect(posted.at(-1)!.text).toMatch(/^Je t’ai répondu en privé, /);
  });
});

describe('agent events go to the member’s own sockets only (spec 2.8)', () => {
  let server: Server;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    server = createServer(agentApp());
    const io = createRealtimeServer(server, { origins: [] });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    afterAll(async () => {
      sockets.forEach((s) => s.close());
      await io.close();
      attachRealtimeServer(null);
      server.close();
    });
  });

  const open = (token: string) =>
    new Promise<Socket>((resolve, reject) => {
      const socket = connect(url, {
        path: '/v1/realtime',
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
      });
      sockets.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });

  it('delivers agent.delta and agent.done to the asker, nothing to another member', async () => {
    const [asker, other] = members as [Member, Member];
    const mine = await open(asker.accessToken);
    const theirs = await open(other.accessToken);
    const got: string[] = [];
    const leaked: string[] = [];
    for (const name of ['agent.delta', 'agent.done', 'agent.activity']) {
      mine.on(name, () => got.push(name));
      theirs.on(name, () => leaked.push(name));
    }
    scriptedAgent([{ toolCalls: [{ name: 'get_rules' }] }, { text: 'Voici les règles.' }]);
    const done = new Promise((resolve) => mine.once('agent.done', resolve));
    await agentApi(asker).post('/v1/agent/messages', { text: 'Les règles ?', groupId });
    await done;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(got).toEqual(expect.arrayContaining(['agent.activity', 'agent.delta', 'agent.done']));
    expect(leaked).toEqual([]);
  });
});
