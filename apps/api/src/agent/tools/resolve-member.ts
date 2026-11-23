// Turns a name the member said into a membership of the active group, through the members service
// (same permission check as GET /groups/:id/members). Ambiguity is returned so the model asks.
import { agentErrorTexts } from '@njangi/shared/i18n/server/agent';
import { listMembers } from '../../modules/members';
import type { AgentCtx } from '../types';
import { refused } from './outcomes';
import { matchName, normalizeName } from './resolve-group';
import type { ToolOutcome } from './types';

export type Resolved = { membershipId: string; name: string } | { outcome: ToolOutcome };

export async function resolveMember(
  ctx: AgentCtx,
  groupId: string,
  query: string,
): Promise<Resolved> {
  const { members } = await listMembers(ctx.userId, groupId);
  const names = members.map((m) => m.user.name);
  const match = matchName(query, names);
  if (match === 'none') {
    // The names of the group (all visible to its members) let the model correct a misspelling.
    return {
      outcome: refused('MEMBER_NOT_FOUND', agentErrorTexts.MEMBER_NOT_FOUND[ctx.lang], {
        members: names.slice(0, 30),
      }),
    };
  }
  if (match === 'ambiguous') {
    const first = normalizeName(query).split(' ')[0] ?? '';
    return {
      outcome: refused('MEMBER_AMBIGUOUS', agentErrorTexts.MEMBER_AMBIGUOUS[ctx.lang], {
        candidates: names.filter((n) => normalizeName(n).includes(first)).slice(0, 5),
      }),
    };
  }
  const member = members[match]!;
  return { membershipId: member.id, name: member.user.name };
}
