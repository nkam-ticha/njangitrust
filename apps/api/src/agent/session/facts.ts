// Gathers the session facts through the services and the permission layer (spec 4.3): the member's
// groups, the active group's open votes, and the money lines from the money port when it exists.
import { componentLogger } from '../../lib/logger';
import { getPrisma } from '../../lib/prisma';
import { listMyGroups } from '../../modules/me';
import { listProposals } from '../../modules/proposals';
import { agentPorts } from '../ports';
import type { AgentCtx } from '../types';
import type { SessionFacts } from './block';

const log = componentLogger('agent');
const READABLE = new Set(['INVITED', 'ACTIVE', 'LEAVING']);

export async function gatherSessionFacts(ctx: AgentCtx): Promise<SessionFacts> {
  const groups = (await listMyGroups(ctx.userId)).filter((g) => READABLE.has(g.membership.status));
  const active = groups.find((g) => g.group.id === ctx.groupId) ?? null;
  let openVotes: number | null = null;
  let money: SessionFacts['money'] = null;
  let recentChat: string[] | undefined;
  if (active && ctx.channel === 'GROUP') {
    try {
      const rows = await getPrisma().message.findMany({
        where: {
          groupId: active.group.id,
          deletedAt: null,
          hiddenByAdminAt: null,
          text: { not: null },
          kind: { in: ['TEXT', 'AGENT'] },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 15,
        select: {
          text: true,
          author: { select: { user: { select: { name: true } } } },
        },
      });
      recentChat = rows.reverse().map((m) => `${m.author?.user.name ?? 'Njangi'}: ${m.text ?? ''}`);
    } catch {
      recentChat = undefined;
    }
  }
  if (active && active.group.status !== 'FORMING') {
    const open = await listProposals(ctx.userId, active.group.id, { status: 'OPEN' });
    openVotes =
      ctx.channel === 'PRIVATE' ? open.filter((v) => v.viewer.canVote).length : open.length;
    const port = agentPorts().money;
    if (port) {
      try {
        money = await port.sessionLines(ctx);
      } catch (error) {
        // The turn goes on without the money lines; tools will say what is wrong.
        log.warn(
          { errorName: error instanceof Error ? error.name : 'unknown' },
          'money lines failed',
        );
      }
    }
  }
  return {
    name: ctx.name,
    lang: ctx.lang,
    role: ctx.role,
    channel: ctx.channel,
    now: ctx.now,
    activeGroup: active
      ? {
          name: active.group.name,
          status: active.group.status,
          memberCount: active.memberCount,
          membershipStatus: active.membership.status,
        }
      : null,
    money,
    openVotes,
    otherGroups: groups.filter((g) => g.group.id !== ctx.groupId).map((g) => g.group.name),
    ...(recentChat && recentChat.length > 0 ? { recentChat } : {}),
  };
}
