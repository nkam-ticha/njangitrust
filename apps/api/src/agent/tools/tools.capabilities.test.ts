// Real services, scripted model: the tools added by the capability audit, and the claim guard
// against the real proposal service (a member add by vote, an admin change, a refusal before the
// first cycle). Nothing here is mocked except the model.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '../../lib/prisma';
import { installFakeMoney, uninstallFakeMoney } from '../../../test/helpers/fake-money-port';
import { createGroup, signUp } from '../../../test/helpers/factories';
import { startedGroup, type Member } from '../../../test/helpers/governance';
import { insertMeeting } from '../../../test/helpers/meeting-helpers';
import { agentApi, scriptedAgent } from '../__tests__/helpers';

let groupId: string;
let admin: Member;
let member: Member;
let target: Member;

beforeAll(async () => {
  installFakeMoney();
  const world = await startedGroup(3);
  groupId = world.groupId;
  admin = world.admin;
  member = world.members[0]!;
  target = world.members[1]!;
});
afterAll(() => uninstallFakeMoney());

const say = (user: Member, text: string, gid = groupId) =>
  agentApi(user).post('/v1/agent/messages', { text, groupId: gid });

describe('a member add by vote through the agent (the reported defect)', () => {
  it('prepares the card, with the number typed in this very message', async () => {
    const llm = scriptedAgent([
      {
        toolCalls: [
          { name: 'propose_member_add', args: { name: 'Hervé Kamga', phone: '[phone-1]' } },
        ],
      },
      { text: 'Voici la carte, confirme-la dans l’app.' },
    ]);
    const res = await say(member, 'Ajoute Hervé Kamga par vote, son numéro est 655 44 33 22');
    expect(res.status).toBe(200);
    expect(res.body.turn.toolCalls).toEqual([{ name: 'propose_member_add', status: 'OK' }]);
    expect(res.body.turn.actions).toHaveLength(1);
    expect(llm.bodyTexts().join('')).not.toMatch(/655 ?44 ?33 ?22/);
    expect(
      await getPrisma().pendingAction.count({
        where: { userId: member.id, type: 'PROPOSAL_CREATE', origin: 'AGENT' },
      }),
    ).toBeGreaterThan(0);
  });

  it('never says a card is ready when the model made no tool call', async () => {
    scriptedAgent([
      { text: 'Voici la carte pour ajouter Hervé.' },
      { text: 'La carte est prête, confirme-la.' },
    ]);
    const before = await getPrisma().pendingAction.count({ where: { userId: member.id } });
    const res = await say(member, 'Ajoute Hervé Kamga par vote');
    expect(res.status).toBe(200);
    expect(res.body.turn.reply.text).toMatch(/^Je n’ai rien préparé/);
    expect(res.body.turn.actions).toEqual([]);
    expect(await getPrisma().pendingAction.count({ where: { userId: member.id } })).toBe(before);
  });

  it('explains the real refusal: a vote is not possible before the first cycle', async () => {
    const forming = await signUp();
    const { groupId: formingId } = await createGroup(forming);
    const llm = scriptedAgent([
      {
        toolCalls: [
          { name: 'propose_member_add', args: { name: 'Hervé Kamga', phone: '655443322' } },
        ],
      },
      { text: 'Voici la carte !' },
      { text: 'La carte est prête.' },
    ]);
    const res = await say(
      { ...forming, membershipId: '' },
      'Ajoute Hervé Kamga par vote',
      formingId,
    );
    expect(res.status).toBe(200);
    expect(res.body.turn.toolCalls).toEqual([{ name: 'propose_member_add', status: 'REFUSED' }]);
    expect(res.body.turn.actions).toEqual([]);
    expect(res.body.turn.reply.text).toMatch(/^Je n’ai pas pu le préparer : .*premier cycle/);
    // The model was told which tool does the job before the first cycle.
    expect(llm.bodyTexts()[1]).toContain('create_invite');
  });

  it('prepares an admin change as a card too', async () => {
    scriptedAgent([
      { toolCalls: [{ name: 'propose_admin_change', args: { member: target.name } }] },
      { text: 'Voici la carte, confirme-la dans l’app.' },
    ]);
    const other = target;
    const res = await say(member, `Propose ${other.name} comme admin`);
    expect(res.body.turn.toolCalls[0]).toMatchObject({ name: 'propose_admin_change' });
  });
});

describe('tools added by the capability audit', () => {
  it('list_invites is for the admin only, and shows no number or link', async () => {
    const llm = scriptedAgent([
      { toolCalls: [{ name: 'list_invites' }] },
      { text: 'Voici les invitations.' },
    ]);
    const res = await say(admin, 'Quelles invitations sont en attente ?');
    expect(res.body.turn.toolCalls).toEqual([{ name: 'list_invites', status: 'OK' }]);
    const result = llm
      .bodyTexts()[1]!
      .split('<tool_result name=\\"list_invites\\">')[1]!
      .split('</tool_result>')[0]!;
    expect(result).toContain('invites');
    expect(result).not.toMatch(/token|phone|https?:/i);

    scriptedAgent([{ toolCalls: [{ name: 'list_invites' }] }, { text: 'Non.' }]);
    const denied = await say(member, 'Quelles invitations ?');
    expect(denied.body.turn.toolCalls).toEqual([{ name: 'list_invites', status: 'INVALID' }]);
  });

  it('list_meetings gives each meeting’s id, date, place and status', async () => {
    const meetingId = await insertMeeting(groupId, 60 * 24, 'Chez Carine');
    const llm = scriptedAgent([
      { toolCalls: [{ name: 'list_meetings' }] },
      { text: 'Voici les réunions.' },
    ]);
    const res = await say(member, 'Quelles réunions sont prévues ?');
    expect(res.body.turn.toolCalls).toEqual([{ name: 'list_meetings', status: 'OK' }]);
    expect(llm.bodyTexts()[1]).toContain(meetingId);
    expect(llm.bodyTexts()[1]).toContain('Chez Carine');
  });

  it('cancel_meeting prepares the admin’s card (the next meeting by default), nobody else’s', async () => {
    scriptedAgent([
      { toolCalls: [{ name: 'cancel_meeting' }] },
      { text: 'Voici la carte, confirme-la dans l’app.' },
    ]);
    const res = await say(admin, 'Annule la prochaine réunion');
    expect(res.body.turn.toolCalls).toEqual([{ name: 'cancel_meeting', status: 'OK' }]);
    expect(res.body.turn.actions).toHaveLength(1);
    expect(
      await getPrisma().pendingAction.count({
        where: { userId: admin.id, type: 'MEETING_CANCEL', origin: 'AGENT' },
      }),
    ).toBe(1);

    scriptedAgent([{ toolCalls: [{ name: 'cancel_meeting' }] }, { text: 'Non.' }]);
    const denied = await say(member, 'Annule la réunion');
    expect(denied.body.turn.toolCalls).toEqual([{ name: 'cancel_meeting', status: 'INVALID' }]);
  });

  it('mark_notifications_read marks everything read and says "done" truthfully', async () => {
    const unread = () =>
      getPrisma().notification.count({ where: { userId: member.id, readAt: null } });
    scriptedAgent([
      { toolCalls: [{ name: 'mark_notifications_read' }] },
      { text: 'C’est fait : tes notifications sont lues.' },
    ]);
    const res = await say(member, 'Marque mes notifications comme lues');
    expect(res.body.turn.toolCalls).toEqual([{ name: 'mark_notifications_read', status: 'OK' }]);
    expect(res.body.turn.reply.text).toBe('C’est fait : tes notifications sont lues.');
    expect(await unread()).toBe(0);
  });
});
