// WITHDRAW (L1, R5.4-R5.5). A withdrawal always requires the member to confirm an exact preview.
import { z } from 'zod';
import { dispatchJob } from '../../jobs/dispatch';
import { lockGroup } from '../../permissions';
import type { ActionContext } from '../pending-actions';
import { defineActionHandler } from '../pending-actions';
import { createWithdrawal, withdrawalPreview } from './withdrawals.service';

const args = z.strictObject({
  groupId: z.string().uuid(),
  amount: z.union([z.number().int().positive(), z.literal('ALL')]),
});

async function prepare(ctx: ActionContext, input: z.infer<typeof args>) {
  return withdrawalPreview(ctx.db, {
    userId: ctx.userId,
    groupId: input.groupId,
    amount: input.amount,
    lang: ctx.lang,
  });
}

export const withdrawHandler = defineActionHandler({
  type: 'WITHDRAW',
  level: 'L1',
  args,
  async prepare(ctx, input) {
    return (await prepare(ctx, input)).preview;
  },
  async execute(ctx, input) {
    // D28: the group lock first, then the member's, then the access check again. Exclusive here:
    // the ledger entry below takes it exclusively anyway, and two shared holders would deadlock on
    // that upgrade. A developer's closing holds it too, so this is either counted by the close or
    // refused after it.
    await lockGroup(ctx.db, input.groupId, 'update');
    const first = await prepare(ctx, input);
    await ctx.db
      .$queryRaw`SELECT "id" FROM "Membership" WHERE "id" = ${first.member.id}::uuid FOR UPDATE`;
    const fresh = await prepare(ctx, input);
    const disbursement = await createWithdrawal(ctx.db, {
      groupId: input.groupId,
      membershipId: fresh.member.id,
      phone: fresh.number.number,
      amount: fresh.withdrawal.amount,
      feeEstimated: fresh.withdrawal.feeEstimate,
    });
    ctx.afterCommit(() =>
      dispatchJob(
        'disbursements.submit',
        { disbursementId: disbursement.id },
        { jobId: `disbursement-submit-${disbursement.id}` },
      ),
    );
    return {
      outcome: 'processing',
      resultRef: disbursement.id,
      summary: { fr: 'Retrait en cours', en: 'Withdrawal processing' },
    };
  },
});
