// Agent tools for members (spec 4.6): public profiles through the members service and its mapper
// (no phone number can even be read there), and announcing a leave at the end of the cycle.
import { toAgentMember } from '../../agent/dto/governance';
import { ok, prepared } from '../../agent/tools/outcomes';
import { needGroup } from '../../agent/tools/resolve-group';
import { resolveMember } from '../../agent/tools/resolve-member';
import { SPECS } from '../../agent/tools/specs';
import { implement } from '../../agent/tools/types';
import { toMemberFor } from '../../dto';
import { createPendingAction } from '../pending-actions';
import { listMembers } from './members.service';

export const memberTools = [
  implement(SPECS.list_members, async (ctx) => {
    const noGroup = needGroup(ctx);
    if (noGroup) return noGroup;
    const { viewer, members } = await listMembers(ctx.userId, ctx.groupId!);
    return ok({
      count: members.length,
      members: members.map((m) => toAgentMember(toMemberFor(viewer, m), ctx.lang)),
    });
  }),
  implement(SPECS.get_member, async (ctx, a) => {
    const noGroup = needGroup(ctx);
    if (noGroup) return noGroup;
    const resolved = await resolveMember(ctx, ctx.groupId!, a.member);
    if ('outcome' in resolved) return resolved.outcome;
    const { viewer, members } = await listMembers(ctx.userId, ctx.groupId!);
    const member = members.find((m) => m.id === resolved.membershipId)!;
    // Turn and reliability come with the money services (rounds, reliability R14).
    return ok({ member: toAgentMember(toMemberFor(viewer, member), ctx.lang) });
  }),
  // Same card as POST /groups/:id/leave.
  implement(SPECS.announce_leave_at_cycle_end, async (ctx) => {
    const noGroup = needGroup(ctx);
    if (noGroup) return noGroup;
    const action = await createPendingAction({
      userId: ctx.userId,
      groupId: ctx.groupId,
      lang: ctx.lang,
      origin: 'AGENT',
      type: 'LEAVE_AT_CYCLE_END',
      args: { groupId: ctx.groupId },
    });
    return prepared(action, ctx.lang);
  }),
];
