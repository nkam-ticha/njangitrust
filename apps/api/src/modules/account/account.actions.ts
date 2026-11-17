// The member's own account: CHANGE_PAYMENT_NUMBER (R13, FSD NUM-01/02) and DELETE_ACCOUNT (PRV-03).
// Both are level 2: one tap and the member's own PIN (R13.2). Only the member themselves, never
// the admin, never another member (R13.7). The new number is sealed while the card is pending and
// erased from the finished card (confidential action).
import { maskNumber, type Bilingual } from '@njangi/shared';
import { accountTexts as t } from '@njangi/shared/i18n/server/account';
import { z } from 'zod';
import { hashPhone } from '../../lib/crypto';
import type { Db, Prisma } from '../../lib/prisma';
import { bilingual, ui } from '../../lib/texts';
import { audit } from '../audit';
import { postSystemMessage } from '../chat';
import { ledgerEventsPort } from '../proposals';
import { createNotifications } from '../notifications';
import { defineActionHandler, type ActionContext } from '../pending-actions';
import { accountError } from './account.errors';
import { anonymiseAccount, deletionBlocker } from './account.service';

const nbsp = ' ';

const changeArgs = z.strictObject({
  number: z.string().regex(/^\+2376\d{8}$/),
  operator: z.enum(['MTN', 'ORANGE']),
});

async function currentNumber(db: Db, userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      deletedAt: true,
      name: true,
      paymentNumbers: { where: { activeTo: null }, take: 1 },
    },
  });
  if (user.deletedAt) throw accountError('ACCOUNT_DELETED');
  return { name: user.name, active: user.paymentNumbers[0] ?? null };
}

async function checkChange(ctx: ActionContext, args: z.infer<typeof changeArgs>, db: Db) {
  const { name, active } = await currentNumber(db, ctx.userId);
  if (active && hashPhone(active.number) === hashPhone(args.number)) {
    throw accountError('NUMBER_UNCHANGED');
  }
  return { name, active };
}

export const changePaymentNumberHandler = defineActionHandler({
  type: 'CHANGE_PAYMENT_NUMBER',
  level: 'L2',
  args: changeArgs,
  confidential: () => true,

  async prepare(ctx, args) {
    await checkChange(ctx, args, ctx.db);
    const shown = maskNumber(args.number);
    return {
      title: ui((c) => c.confirmation.actions.changePaymentNumber.title),
      lines: [],
      total: null,
      notes: [
        { fr: `Nouveau numéro${nbsp}: ${shown}`, en: `New number: ${shown}` },
        t.numberHoldNote,
      ],
      confirmLabel: ui((c) => c.confirmation.actions.changePaymentNumber.button),
    };
  },

  async execute(ctx, args) {
    const { name, active } = await checkChange(ctx, args, ctx.db);
    // R13.3: the new number applies to everything from now on; operations already sent keep the
    // old one (they hold their own copy). R13.6: the old number stays in the member's history.
    if (active) {
      await ctx.db.paymentNumber.update({ where: { id: active.id }, data: { activeTo: ctx.now } });
    }
    await ctx.db.paymentNumber.create({
      data: {
        userId: ctx.userId,
        number: args.number,
        operator: args.operator,
        activeFrom: ctx.now,
      },
    });
    const memberships = await ctx.db.membership.findMany({
      where: { userId: ctx.userId, status: { in: ['ACTIVE', 'LEAVING'] } },
      select: { id: true, groupId: true },
    });
    const admins = await ctx.db.membership.findMany({
      where: {
        groupId: { in: memberships.map((m) => m.groupId) },
        role: 'ADMIN',
        status: 'ACTIVE',
        userId: { not: ctx.userId },
      },
      select: { userId: true, groupId: true },
    });
    for (const membership of memberships) {
      // R13.4: a fact in the group's records and a message in the chat, with no digits.
      await ledgerEventsPort().appendEvent(ctx.db, {
        groupId: membership.groupId,
        event: { event: 'PAYMENT_NUMBER_CHANGED', membershipId: membership.id },
        description: bilingual(t.numberChangedGroup, { name }),
        membershipId: membership.id,
        refType: 'Membership',
        refId: membership.id,
        occurredAt: ctx.now,
      });
      await postSystemMessage(
        membership.groupId,
        bilingual(t.numberChangedGroup, { name }),
        ctx.effects,
        ctx.db,
      );
    }
    const notices: Parameters<typeof createNotifications>[0] = [
      {
        userId: ctx.userId,
        category: 'SECURITY',
        title: t.numberChangedTitle,
        body: t.numberChangedBody,
      },
      ...admins.map((admin) => ({
        userId: admin.userId,
        groupId: admin.groupId,
        category: 'SECURITY' as const,
        title: t.numberChangedAdminTitle,
        body: bilingual(t.numberChangedAdminBody, { name }),
      })),
    ];
    await createNotifications(notices, ctx.effects, ctx.db);
    await audit(
      {
        action: 'account.payment_number.changed',
        actorUserId: ctx.userId,
        target: `User:${ctx.userId}`,
        details: { operator: args.operator },
      },
      ctx.db,
    );
    return {
      outcome: 'done',
      resultRef: null,
      summary: ui((c) => c.confirmation.actions.changePaymentNumber.done),
    };
  },

  redacted() {
    return {
      args: {},
      preview: {
        title: ui((c) => c.confirmation.actions.changePaymentNumber.title),
        lines: [],
        total: null,
        notes: [],
        confirmLabel: ui((c) => c.confirmation.actions.changePaymentNumber.button),
      },
    };
  },
});

const deleteArgs = z.strictObject({});

async function checkDelete(ctx: ActionContext, db: Db | Prisma.TransactionClient) {
  const { name } = await currentNumber(db, ctx.userId);
  const blocker = await deletionBlocker(db, ctx.userId);
  if (blocker) throw accountError(blocker);
  return { name };
}

export const deleteAccountHandler = defineActionHandler({
  type: 'DELETE_ACCOUNT',
  level: 'L2',
  args: deleteArgs,

  async prepare(ctx) {
    await checkDelete(ctx, ctx.db);
    const notes: Bilingual[] = [t.deleteNote, t.deleteNoteIrreversible];
    return {
      title: ui((c) => c.confirmation.actions.deleteAccount.title),
      lines: [],
      total: null,
      notes,
      confirmLabel: ui((c) => c.confirmation.actions.deleteAccount.button),
    };
  },

  async execute(ctx) {
    await checkDelete(ctx, ctx.db);
    await anonymiseAccount(ctx.db, ctx.userId, ctx.now, ctx.effects);
    return {
      outcome: 'done',
      resultRef: null,
      summary: ui((c) => c.confirmation.actions.deleteAccount.done),
    };
  },
});
