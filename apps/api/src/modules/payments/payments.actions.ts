import { formatXAF, maskNumber } from '@njangi/shared';
import { z } from 'zod';
import { getEnv } from '../../config/env';
import { authorizeGroup } from '../../permissions';
import type { ActionContext } from '../pending-actions';
import { defineActionHandler } from '../pending-actions';
import { createPaymentIntent, paymentPreview, submitPaymentIntent } from './payments.service';

const args = z.strictObject({
  groupId: z.string().uuid(),
  obligationIds: z.array(z.string().uuid()).min(1).max(30),
});

async function preview(ctx: ActionContext, a: z.infer<typeof args>) {
  await authorizeGroup(ctx.userId, a.groupId, 'group.payments.create', ctx.db);
  return paymentPreview(ctx.db, {
    groupId: a.groupId,
    userId: ctx.userId,
    obligationIds: a.obligationIds,
    lang: ctx.lang,
  });
}

export const payHandler = defineActionHandler({
  type: 'PAY',
  level: 'L1',
  args,
  async prepare(ctx, a) {
    const result = await preview(ctx, a);
    return {
      title: { fr: 'Payer tes cotisations', en: 'Pay your contributions' },
      lines: result.lines,
      total: result.prepared.total,
      notes: [
        {
          fr: `Demande sur ${maskNumber(result.phone)}`,
          en: `Request to ${maskNumber(result.phone)}`,
        },
      ],
      confirmLabel: {
        fr: `Payer ${formatXAF(result.prepared.total, ctx.lang)}`,
        en: `Pay ${formatXAF(result.prepared.total, ctx.lang)}`,
      },
    };
  },
  async execute(ctx, a) {
    // Serialize simultaneous confirmations by member; the second sees the first intent's reserved
    // obligation IDs after the first transaction commits.
    const snapshot = await preview(ctx, a);
    await ctx.db
      .$queryRaw`SELECT "id" FROM "Membership" WHERE "id" = ${snapshot.member.id}::uuid FOR UPDATE`;
    const fresh = await preview(ctx, a);
    const intent = await createPaymentIntent(ctx.db, {
      groupId: a.groupId,
      membershipId: fresh.member.id,
      obligationIds: a.obligationIds,
      phone: fresh.phone,
      amount: fresh.prepared.total,
      provider: getEnv().PAYMENT_PROVIDER,
    });
    ctx.afterCommit(() => submitPaymentIntent(intent.id));
    return { outcome: 'processing', resultRef: intent.id, summary: null };
  },
});
