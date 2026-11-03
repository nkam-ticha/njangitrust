// INVITE_CREATE (L1, admin): R1.6 founding members before the first cycle, then only for a
// passed MEMBER_ADD whose phone matches (R12.1). The link is returned once and never stored.
import { canInvite } from '@njangi/rules';
import { inviteActionTexts as t } from '@njangi/shared/i18n/server/groups';
import { z } from 'zod';
import { getEnv } from '../../config/env';
import { hashLinkToken, randomToken, safeEqual } from '../../lib/crypto';
import type { Db } from '../../lib/prisma';
import { bilingual, ui } from '../../lib/texts';
import { authorizeGroup } from '../../permissions';
import { audit } from '../audit';
import { countMembers } from '../groups';
import { defineActionHandler, type ActionContext } from '../pending-actions';
import { readMemberAddPayload } from '../proposals';
import { inviteError } from './invites.errors';

/** Spec 2.10: an invite link is valid 72 hours. */
export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

export const inviteArgsSchema = z.strictObject({
  groupId: z.string().uuid(),
  inviteeName: z.string().min(2).max(60),
  /** HMAC of the invited phone (lib/crypto hashPhone); the number itself is never stored. */
  phoneHash: z.string().regex(/^[0-9a-f]{64}$/),
  proposalId: z.string().uuid().nullable(),
});
export type InviteArgs = z.infer<typeof inviteArgsSchema>;

function openInvitesWhere(groupId: string, now: Date) {
  return { groupId, usedAt: null, revokedAt: null, expiresAt: { gt: now } };
}

/** Every check of an invite request; returns whether it is for a founding member. */
async function checkInvite(ctx: ActionContext, args: InviteArgs, db: Db): Promise<{ founding: boolean }> {
  const access = await authorizeGroup(ctx.userId, args.groupId, 'group.invites.create', db);
  const firstCycleStarted = access.group.status !== 'FORMING';
  const pendingInvites = await db.invite.count({ where: openInvitesWhere(args.groupId, ctx.now) });
  const memberCount = (await countMembers(args.groupId, db)) + pendingInvites;

  if (args.proposalId) {
    const proposal = await db.proposal.findFirst({
      where: { id: args.proposalId, groupId: args.groupId, type: 'MEMBER_ADD' },
      select: { status: true, payload: true },
    });
    if (!proposal || proposal.status !== 'PASSED') throw inviteError('PROPOSAL_NOT_PASSED');
    if (!safeEqual(readMemberAddPayload(proposal.payload).phoneHash, args.phoneHash)) {
      throw inviteError('PROPOSAL_PHONE_MISMATCH');
    }
    const previous = await db.invite.findMany({ where: { proposalId: args.proposalId }, select: { usedAt: true, revokedAt: true, expiresAt: true } });
    if (previous.some((i) => i.usedAt)) throw inviteError('PROPOSAL_ALREADY_USED');
    if (previous.some((i) => !i.revokedAt && i.expiresAt > ctx.now)) throw inviteError('INVITE_ALREADY_PENDING');
  } else {
    const samePerson = await db.invite.count({ where: { ...openInvitesWhere(args.groupId, ctx.now), phoneHash: args.phoneHash } });
    if (samePerson > 0) throw inviteError('INVITE_ALREADY_PENDING');
  }

  const decision = canInvite({ firstCycleStarted, memberAddPassed: args.proposalId !== null, memberCount });
  if (!decision.ok) {
    if (decision.code === 'GROUP_FULL') throw inviteError('GROUP_FULL', { params: { max: decision.maximum } });
    throw inviteError('PROPOSAL_REQUIRED');
  }
  return { founding: !firstCycleStarted };
}

export const inviteCreateHandler = defineActionHandler({
  type: 'INVITE_CREATE',
  level: 'L1',
  args: inviteArgsSchema,

  async prepare(ctx, args) {
    const { founding } = await checkInvite(ctx, args, ctx.db);
    const name = { name: args.inviteeName };
    return {
      title: ui((c) => c.invite.approved.title, name),
      lines: [],
      total: null,
      notes: [
        bilingual(founding ? t.noteFounding : t.noteNextCycle, name),
        ui((c) => c.invite.founding.phoneHelp),
        t.noteLink,
      ],
      confirmLabel: ui((c) => c.confirmation.actions.createInvite.button),
    };
  },

  async execute(ctx, args) {
    const creator = await authorizeGroup(ctx.userId, args.groupId, 'group.invites.create', ctx.db);
    const token = randomToken(32);
    const expiresAt = new Date(ctx.now.getTime() + INVITE_TTL_MS);
    const invite = await ctx.db.invite.create({
      data: {
        groupId: args.groupId,
        proposalId: args.proposalId,
        inviteeName: args.inviteeName,
        phoneHash: args.phoneHash,
        tokenHash: hashLinkToken(token),
        expiresAt,
        createdByMembershipId: creator.membership.id,
      },
      select: { id: true },
    });
    await audit(
      {
        action: 'invite.created',
        actorUserId: ctx.userId,
        groupId: args.groupId,
        target: `Invite:${invite.id}`,
        details: { founding: args.proposalId === null },
      },
      ctx.db,
    );
    return {
      outcome: 'done',
      resultRef: invite.id,
      summary: ui((c) => c.confirmation.actions.createInvite.done),
      data: { inviteId: invite.id, link: `${getEnv().PUBLIC_BASE_URL}/invite/${token}`, expiresAt: expiresAt.toISOString() },
    };
  },
});
