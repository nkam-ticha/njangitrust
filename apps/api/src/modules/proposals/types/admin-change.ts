// ADMIN_CHANGE (R1.4, R11.1, FSD GOV-03): secret, majority, immediate. The one-admin index means
// the old admin is demoted before the new one is promoted.
import { proposalTexts } from '@njangi/shared/i18n/server/proposals';
import { z } from 'zod';
import { bilingual, ui } from '../../../lib/texts';
import { createNotifications } from '../../notifications';
import { postSystemMessage } from '../../chat';
import { proposalError } from '../proposals.errors';
import { appliedOn, defineProposal, memberRef, nameOf } from './definition';
import { assertNoOpenProposalAbout } from './membership-end';

const payload = z.strictObject({ membershipId: z.string().uuid() });

export const adminChange = defineProposal({
  type: 'ADMIN_CHANGE',
  input: payload,
  payload,

  async plan(ctx, args) {
    const target = ctx.activeMembers.find((m) => m.id === args.membershipId);
    if (!target) throw proposalError('MEMBER_NOT_FOUND');
    if (target.role === 'ADMIN') throw proposalError('ALREADY_ADMIN');
    if (target.status !== 'ACTIVE') throw proposalError('ONLY_ACTIVE_MEMBERS');
    await assertNoOpenProposalAbout(ctx, 'ADMIN_CHANGE', target.id);
    return {
      payload: args,
      subjectMembershipId: target.id,
      excludedMembershipId: null,
      mustApprove: [],
      notes: [],
    };
  },

  describe(p, names) {
    return {
      title: ui((c) => c.votes.titles.adminChange, { name: nameOf(names, p.membershipId) }),
      subject: { type: 'ADMIN_CHANGE', member: memberRef(names, p.membershipId) },
    };
  },

  async apply(ctx, p) {
    const target = await ctx.tx.membership.findFirst({
      where: { id: p.membershipId, groupId: ctx.group.id, status: { in: ['ACTIVE', 'LEAVING'] } },
      select: { id: true, userId: true },
    });
    if (!target) return ui((c) => c.votes.card.effect.none);
    await ctx.tx.membership.updateMany({
      where: { groupId: ctx.group.id, role: 'ADMIN', id: { not: target.id } },
      data: { role: 'MEMBER' },
    });
    await ctx.tx.membership.update({ where: { id: target.id }, data: { role: 'ADMIN' } });
    const name = nameOf(ctx.names, target.id);
    await postSystemMessage(
      ctx.group.id,
      ui((c) => c.chat.system.adminChanged, { name }),
      ctx.effects,
      ctx.tx,
    );
    await createNotifications(
      [
        {
          userId: target.userId,
          groupId: ctx.group.id,
          category: 'GROUP',
          title: proposalTexts.adminTitle,
          body: bilingual(proposalTexts.adminBody, { group: ctx.group.name }),
          deepLink: `/groups/${ctx.group.id}/settings`,
        },
      ],
      ctx.effects,
      ctx.tx,
    );
    return appliedOn(ctx.now);
  },
});
