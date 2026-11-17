// Ending a membership after a passed EARLY_EXIT or MEMBER_REMOVE (R12.3, R12.4, FSD MEM-02). The
// money settlement (refund, shortfall shares, debts, D13.4 loan balance) is the money modules' job.
import { proposalTexts } from '@njangi/shared/i18n/server/proposals';
import { bilingual, ui } from '../../../lib/texts';
import { postSystemMessage } from '../../chat';
import { endMembershipAccess } from '../../members';
import { createNotifications } from '../../notifications';
import { ledgerEventsPort, moneyPort } from '../governance-ports';
import { proposalError } from '../proposals.errors';
import { nameOf, type ApplyContext, type PlanContext } from './definition';

export async function endMembership(
  ctx: ApplyContext,
  input: { membershipId: string; reason: 'EARLY_EXIT' | 'REMOVED' },
): Promise<void> {
  const member = await ctx.tx.membership.findUniqueOrThrow({
    where: { id: input.membershipId },
    select: { status: true, userId: true },
  });
  if (member.status === 'LEFT' || member.status === 'REMOVED') return;
  const settles = member.status === 'ACTIVE' || member.status === 'LEAVING';
  await ctx.tx.membership.update({
    where: { id: input.membershipId },
    data: { status: input.reason === 'REMOVED' ? 'REMOVED' : 'LEFT', leftAt: ctx.now },
  });
  if (settles) {
    const port = moneyPort();
    // A settlement is never skipped: without the money modules the vote does not apply.
    if (!port) throw proposalError('PROPOSAL_TYPE_UNAVAILABLE');
    await port.settleExit(ctx.tx, {
      groupId: ctx.group.id,
      membershipId: input.membershipId,
      reason: input.reason,
      proposalId: ctx.proposal.id,
    });
  }
  const name = nameOf(ctx.names, input.membershipId);
  await ledgerEventsPort().appendEvent(ctx.tx, {
    groupId: ctx.group.id,
    event: { event: 'MEMBER_LEFT', membershipId: input.membershipId, reason: input.reason },
    description:
      input.reason === 'REMOVED'
        ? ui((c) => c.chat.system.memberRemoved, { name })
        : ui((c) => c.chat.system.memberLeft, { name }),
    membershipId: input.membershipId,
    refType: 'Proposal',
    refId: ctx.proposal.id,
    occurredAt: ctx.now,
  });
  await postSystemMessage(
    ctx.group.id,
    input.reason === 'REMOVED'
      ? ui((c) => c.chat.system.memberRemoved, { name })
      : ui((c) => c.chat.system.memberLeft, { name }),
    ctx.effects,
    ctx.tx,
  );
  // R12.4, privacy-guard L-6: a removed member is told (no vote detail); a leaver asked for it.
  if (input.reason === 'REMOVED') {
    await createNotifications(
      [
        {
          userId: member.userId,
          groupId: ctx.group.id,
          category: 'GROUP',
          title: proposalTexts.removedTitle,
          body: bilingual(proposalTexts.removedBody, { group: ctx.group.name }),
        },
      ],
      ctx.effects,
      ctx.tx,
    );
  }
  // R12.4: the former member keeps statements and data export only; their sockets leave the room.
  endMembershipAccess(ctx.effects, { userId: member.userId, groupId: ctx.group.id });
}

/** Settlements need the money modules once a cycle runs. */
export function requireMoneyPort(): void {
  if (!moneyPort()) throw proposalError('PROPOSAL_TYPE_UNAVAILABLE');
}

/** No two open proposals of one type about the same member. */
export async function assertNoOpenProposalAbout(
  ctx: PlanContext,
  type: 'MEMBER_REMOVE' | 'ADMIN_CHANGE' | 'EARLY_EXIT' | 'FINE_WAIVER',
  membershipId: string,
): Promise<void> {
  const open = await ctx.db.proposal.count({
    where: { groupId: ctx.group.id, type, status: 'OPEN', subjectMembershipId: membershipId },
  });
  if (open > 0) throw proposalError('PROPOSAL_ALREADY_OPEN');
}
