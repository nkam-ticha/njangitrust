// A conversation is tied to a group only after the member's access to it is checked: naming a group
// the member does not belong to is refused and leaves nothing behind (privacy-guard, turns.ts note).
import { describe, expect, it } from 'vitest';
import { getPrisma } from '../../lib/prisma';
import { signUp } from '../../../test/helpers/factories';
import { startedGroup } from '../../../test/helpers/governance';
import { agentApi, scriptedAgent } from './helpers';

describe('the group of a private conversation', () => {
  it('is never set to a group the member cannot read', async () => {
    const world = await startedGroup(2);
    const stranger = await signUp();
    scriptedAgent([{ text: 'Bonjour.' }]);
    const refused = await agentApi(stranger).post('/v1/agent/messages', {
      text: 'Bonjour',
      groupId: world.groupId,
    });
    expect(refused.status).toBeGreaterThanOrEqual(400);
    const rows = await getPrisma().agentConversation.findMany({ where: { userId: stranger.id } });
    expect(rows.every((row) => row.groupId === null)).toBe(true);
  });

  it('is set once the member is allowed to read the group', async () => {
    const world = await startedGroup(2);
    const member = world.members[0]!;
    scriptedAgent([{ text: 'Bonjour.' }]);
    const ok = await agentApi(member).post('/v1/agent/messages', {
      text: 'Bonjour',
      groupId: world.groupId,
    });
    expect(ok.status).toBe(200);
    const row = await getPrisma().agentConversation.findFirstOrThrow({
      where: { userId: member.id, channel: 'PRIVATE' },
    });
    expect(row.groupId).toBe(world.groupId);
  });
});
