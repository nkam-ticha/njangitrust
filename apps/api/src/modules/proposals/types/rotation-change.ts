// ROTATION_CHANGE (R2.4, R11.1, FSD §6): majority, and every member whose turn moves must vote
// yes. Two members not yet served swap turns from the next round.
import { validateRotationSwap } from '@njangi/rules';
import { z } from 'zod';
import { ui } from '../../../lib/texts';
import { ledgerEventsPort, moneyOperation } from '../governance-ports';
import { proposalError } from '../proposals.errors';
import { defineProposal, memberRef, nameOf } from './definition';

const payload = z.strictObject({ swap: z.tuple([z.string().uuid(), z.string().uuid()]) });

const REFUSALS = {
  SAME_MEMBER: 'ROTATION_SAME_MEMBER',
  NOT_IN_ROTATION: 'ROTATION_NOT_IN_ROTATION',
  ROTATION_POSITION_ALREADY_SERVED: 'ROTATION_ALREADY_SERVED',
} as const;

export const rotationChange = defineProposal({
  type: 'ROTATION_CHANGE',
  input: payload,
  payload,

  async plan(ctx, args) {
    const read = moneyOperation('currentRotation');
    if (!read || !moneyOperation('applyRotationChange'))
      throw proposalError('PROPOSAL_TYPE_UNAVAILABLE');
    const current = await read(ctx.db, ctx.group.id);
    if (!current) throw proposalError('ROTATION_NOT_STARTED');
    const check = validateRotationSwap({
      rotation: current.rotation,
      currentRound: current.currentRound,
      first: args.swap[0],
      second: args.swap[1],
    });
    if (!check.ok) throw proposalError(REFUSALS[check.code]);
    return {
      payload: args,
      subjectMembershipId: null,
      excludedMembershipId: null,
      mustApprove: check.mustApprove,
      notes: [ui((c) => c.votes.threshold.rotation)],
    };
  },

  describe(p, names) {
    return {
      title: ui((c) => c.votes.titles.rotationSwap, {
        a: nameOf(names, p.swap[0]),
        b: nameOf(names, p.swap[1]),
      }),
      subject: {
        type: 'ROTATION_CHANGE',
        swap: [memberRef(names, p.swap[0]), memberRef(names, p.swap[1])],
      },
    };
  },

  async apply(ctx, p) {
    const change = moneyOperation('applyRotationChange');
    const current = (await moneyOperation('currentRotation')?.(ctx.tx, ctx.group.id)) ?? null;
    if (!change || !current) return ui((c) => c.votes.card.effect.none);
    // The rotation may have moved on since the vote opened: re-check, and change nothing if invalid.
    const check = validateRotationSwap({
      rotation: current.rotation,
      currentRound: current.currentRound,
      first: p.swap[0],
      second: p.swap[1],
    });
    if (!check.ok) return ui((c) => c.votes.card.effect.none);
    await change(ctx.tx, {
      groupId: ctx.group.id,
      newOrder: check.newOrder,
      proposalId: ctx.proposal.id,
    });
    await ledgerEventsPort().appendEvent(ctx.tx, {
      groupId: ctx.group.id,
      event: {
        event: 'ROTATION_CHANGED',
        cycleNumber: current.cycleNumber,
        order: check.newOrder,
        proposalId: ctx.proposal.id,
      },
      description: ui((c) => c.votes.types.ROTATION_CHANGE),
      refType: 'Proposal',
      refId: ctx.proposal.id,
      occurredAt: ctx.now,
    });
    return ui((c) => c.votes.card.effect.pending, { round: current.currentRound + 1 });
  },
});
