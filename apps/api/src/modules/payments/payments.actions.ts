import { formatXAF, maskNumber } from '@njangi/shared';
import { z } from 'zod';
import { getEnv } from '../../config/env';
import { authorizeGroup, lockGroup } from '../../permissions';
import type { ActionContext } from '../pending-actions';
import { assertSamePreview, defineActionHandler } from '../pending-actions';
import { paymentError } from './payments.errors';
import { createPaymentIntent, paymentPreview, submitPaymentIntent } from './payments.service';

const args = z.strictObject({
  groupId: z.string().uuid(),
  obligationIds: z.array(z.string().uuid()).min(1).max(30),
});

async function preview(ctx: ActionContext, a: z.infer<typeof args>) {
  const access = await authorizeGroup(ctx.userId, a.groupId, 'group.payments.create', ctx.db);
  // While a vote on this member's leaving is open they are settled from the ledger as it stands
  // when it closes: nothing new may start (the vote itself waits for nothing to be in flight).
  const exitVote = await ctx.db.proposal.count({
    where: {
      groupId: a.groupId,
      status: 'OPEN',
      type: { in: ['EARLY_EXIT', 'MEMBER_REMOVE'] },
      subjectMembershipId: access.membership.id,
    },
  });
  if (exitVote > 0) throw paymentError('PAYMENT_BLOCKED_BY_EXIT_VOTE');
  return paymentPreview(ctx.db, {
    groupId: a.groupId,
    userId: ctx.userId,
    obligationIds: a.obligationIds,
    lang: ctx.lang,
  });
}

/** The card the member sees and confirms, built from a prepared payment. */
function card(ctx: ActionContext, result: Awaited<ReturnType<typeof preview>>) {
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
}

export const payHandler = defineActionHandler({
  type: 'PAY',
  level: 'L1',
  args,
  async prepare(ctx, a) {
    return card(ctx, await preview(ctx, a));
  },
  async execute(ctx, a) {
    // D28: the group lock first (shared: confirmations do not wait for each other, a developer's
    // closing does), then the access check below sees a group closed and hidden meanwhile.
    await lockGroup(ctx.db, a.groupId, 'share');
    // Serialize simultaneous confirmations by member; the second sees the first intent's reserved
    // obligation IDs after the first transaction commits.
    const snapshot = await preview(ctx, a);
    await ctx.db
      .$queryRaw`SELECT "id" FROM "Membership" WHERE "id" = ${snapshot.member.id}::uuid FOR UPDATE`;
    const fresh = await preview(ctx, a);
    // Under the locks: the request sent to the member's phone must be exactly the card confirmed.
    assertSamePreview(ctx.preview, card(ctx, fresh));
    const intent = await createPaymentIntent(ctx.db, {
      groupId: a.groupId,
      membershipId: fresh.member.id,
      obligationIds: a.obligationIds,
      phone: fresh.phone,
      amount: fresh.prepared.total,
      parts: fresh.prepared.parts,
      provider: getEnv().PAYMENT_PROVIDER,
    });
    ctx.afterCommit(() => submitPaymentIntent(intent.id));
    return { outcome: 'processing', resultRef: intent.id, summary: null };
  },
});
