// PIN_RESET_APPROVE (L2: the confirming member types their own PIN). When the last needed
// confirmation lands (the admin's, or the second member's for the admin, D8), a one-time link
// valid 30 minutes is created and shown once to that member. Wording: designer copy `pinReset.*`.
import { z } from 'zod';
import { getEnv } from '../../config/env';
import { hashLinkToken, randomToken } from '../../lib/crypto';
import { ui } from '../../lib/texts';
import { defineActionHandler } from '../pending-actions';
import { audit } from '../audit';
import { authError } from './auth.errors';
import { loadReview, type ReviewState } from './pin-reset.review';

export const PIN_RESET_LINK_TTL_MS = 30 * 60 * 1000;

const argsSchema = z.strictObject({ pinResetId: z.string().uuid(), groupId: z.string().uuid() });

function previewOf(review: ReviewState) {
  const name = { name: review.requesterName };
  if (review.needed === 1) {
    return {
      title: ui((c) => c.pinReset.admin.title),
      lines: [],
      total: null,
      notes: [ui((c) => c.pinReset.admin.body, name), ui((c) => c.pinReset.admin.linkBody)],
      confirmLabel: ui((c) => c.pinReset.admin.confirm),
    };
  }
  const count = review.given;
  return {
    title: ui((c) => c.pinReset.members.title),
    lines: [],
    total: null,
    notes: [
      ui((c) => c.pinReset.members.body, name),
      ui((c) => (count === 1 ? c.pinReset.members.progress_one : c.pinReset.members.progress_other), { count }),
    ],
    confirmLabel: ui((c) => c.pinReset.members.confirm),
  };
}

export const pinResetApproveHandler = defineActionHandler({
  type: 'PIN_RESET_APPROVE',
  level: 'L2',
  args: argsSchema,

  async prepare(ctx, args) {
    const review = await loadReview(ctx.userId, args.groupId, args.pinResetId, ctx.db);
    if (review.confirmedByMe) throw authError('PIN_RESET_ALREADY_CONFIRMED');
    return previewOf(review);
  },

  async execute(ctx, args) {
    // Serialise confirmations of one request: the second confirmer must see the first.
    await ctx.db.$queryRaw`SELECT "id" FROM "PinReset" WHERE "id" = ${args.pinResetId}::uuid FOR UPDATE`;
    const review = await loadReview(ctx.userId, args.groupId, args.pinResetId, ctx.db);
    if (review.confirmedByMe) throw authError('PIN_RESET_ALREADY_CONFIRMED');
    await ctx.db.pinResetApproval.create({
      data: { pinResetId: args.pinResetId, groupId: args.groupId, membershipId: review.reviewerMembershipId },
    });
    const given = review.given + 1;
    await audit(
      {
        action: 'pin.reset.confirmed',
        actorUserId: ctx.userId,
        groupId: args.groupId,
        target: `PinReset:${args.pinResetId}`,
        details: { confirmation: given, needed: review.needed },
      },
      ctx.db,
    );
    if (given < review.needed) {
      return {
        outcome: 'done',
        resultRef: args.pinResetId,
        summary: ui((c) => c.pinReset.members.waiting),
        data: { approved: false },
      };
    }
    const token = randomToken(32);
    const linkExpiresAt = new Date(ctx.now.getTime() + PIN_RESET_LINK_TTL_MS);
    await ctx.db.pinReset.update({
      where: { id: args.pinResetId },
      data: {
        status: 'APPROVED',
        approvedAt: ctx.now,
        approvedInGroupId: args.groupId,
        tokenHash: hashLinkToken(token),
        linkExpiresAt,
      },
    });
    await audit(
      { action: 'pin.reset.approved', actorUserId: ctx.userId, groupId: args.groupId, target: `PinReset:${args.pinResetId}` },
      ctx.db,
    );
    const name = { name: review.requesterName };
    return {
      outcome: 'done',
      resultRef: args.pinResetId,
      summary:
        review.needed === 1
          ? ui((c) => c.pinReset.admin.linkTitle, name)
          : ui((c) => c.pinReset.members.ready, name),
      data: {
        approved: true,
        link: `${getEnv().PUBLIC_BASE_URL}/reset-pin/${token}`,
        linkExpiresAt: linkExpiresAt.toISOString(),
      },
    };
  },
});
