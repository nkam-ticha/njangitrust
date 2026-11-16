import { formatDateTime, formatXAF } from '@njangi/shared';
import { z } from 'zod';
import { ui } from '../../lib/texts';
import { defineActionHandler } from '../pending-actions';
import { prepareBid } from './bids.service';
import { bidError } from './bids.errors';

const argsSchema = z.strictObject({
  groupId: z.string().uuid(),
  roundId: z.string().uuid(),
  amount: z.number().int().positive(),
});

export const placeBidHandler = defineActionHandler({
  type: 'PLACE_BID',
  level: 'L1',
  args: argsSchema,

  async prepare(ctx, args) {
    const prepared = await prepareBid(
      ctx.userId,
      args.groupId,
      args.roundId,
      args.amount,
      ctx.now,
      ctx.db,
    );
    const raised = prepared.action === 'RAISE';
    return {
      title: raised
        ? ui((c) => c.confirmation.actions.raiseBid.title)
        : ui((c) => c.confirmation.actions.placeBid.title, { round: prepared.round.number }),
      lines: [{ label: ui((c) => c.confirmation.lines.bidAmount), amount: args.amount }],
      total: args.amount,
      notes: [
        ui((c) => c.confirmation.notes.bidSealed, {
          date: {
            fr: formatDateTime(prepared.round.dueAt, 'fr'),
            en: formatDateTime(prepared.round.dueAt, 'en'),
          },
        }),
      ],
      confirmLabel: raised
        ? ui((c) => c.confirmation.actions.raiseBid.button, {
            amount: { fr: formatXAF(args.amount, 'fr'), en: formatXAF(args.amount, 'en') },
          })
        : ui((c) => c.confirmation.actions.placeBid.button, {
            amount: { fr: formatXAF(args.amount, 'fr'), en: formatXAF(args.amount, 'en') },
          }),
    };
  },

  async execute(ctx, args) {
    const prepared = await prepareBid(
      ctx.userId,
      args.groupId,
      args.roundId,
      args.amount,
      ctx.now,
      ctx.db,
    );
    if (prepared.action === 'RAISE') {
      await ctx.db.bid.update({
        where: {
          roundId_membershipId: {
            roundId: args.roundId,
            membershipId: prepared.access.membership.id,
          },
        },
        data: { amount: args.amount, updatedAt: ctx.now },
      });
    } else if (!prepared.current) {
      await ctx.db.bid.create({
        data: {
          roundId: args.roundId,
          membershipId: prepared.access.membership.id,
          amount: args.amount,
          placedAt: ctx.now,
          updatedAt: ctx.now,
        },
      });
    } else {
      throw bidError('BID_ACTION_CHANGED');
    }
    return {
      outcome: 'done',
      resultRef: args.roundId,
      summary: ui((c) => c.confirmation.actions.placeBid.done),
    };
  },
});
