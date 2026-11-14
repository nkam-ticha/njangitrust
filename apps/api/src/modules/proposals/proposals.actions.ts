// PROPOSAL_CREATE (L1): any proposal type a member can make (R11.1). The card shows the title, the
// threshold against all eligible voters, the vote window and, for secret votes, the secrecy note.
import { textSchema } from '@njangi/shared/contracts/common';
import { proposalTypeSchema } from '@njangi/shared/contracts/proposals';
import { z } from 'zod';
import { ui } from '../../lib/texts';
import { defineActionHandler } from '../pending-actions';
import { planContext } from './proposals.context';
import { openProposal, prepareProposal, proposalCard } from './proposals.create';

export const proposalArgsSchema = z.strictObject({
  groupId: z.string().uuid(),
  type: proposalTypeSchema,
  /** The type's normalised input (ids, keyed hashes; never a raw phone number). */
  input: z.record(z.string(), z.unknown()),
  /** L-2: checked again here, not only at the HTTP edge (spec 2.11). */
  reason: textSchema(500).nullable(),
});
export type ProposalArgs = z.infer<typeof proposalArgsSchema>;

export const proposalCreateHandler = defineActionHandler({
  type: 'PROPOSAL_CREATE',
  level: 'L1',
  args: proposalArgsSchema,

  async prepare(ctx, args) {
    const plan = await planContext(ctx.db, ctx.userId, args.groupId, ctx.now);
    return proposalCard(await prepareProposal(plan, args.type, args.input));
  },

  async execute(ctx, args) {
    const plan = await planContext(ctx.db, ctx.userId, args.groupId, ctx.now);
    const prepared = await prepareProposal(plan, args.type, args.input);
    const proposal = await openProposal(ctx.db, plan, prepared, args.reason, ctx.effects);
    return {
      outcome: 'done',
      resultRef: proposal.id,
      summary: ui((c) => c.confirmation.actions.propose.done),
    };
  },
});
