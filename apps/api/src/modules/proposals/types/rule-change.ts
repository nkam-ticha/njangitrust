// RULE_CHANGE (R11.1, R11.6, R11.7, FSD GOV-01, GOV-04, AC-05, D13.1): two-thirds of eligible
// voters; a passed change becomes a new rule set version applied from the next round.
import {
  applyRuleChange,
  validateRuleChange,
  type ParameterName,
  type RuleSetParams,
} from '@njangi/rules';
import type { Bilingual } from '@njangi/shared';
import { ruleChangesSchema } from '@njangi/shared/contracts/proposals';
import { z } from 'zod';
import type { Db } from '../../../lib/prisma';
import { ui } from '../../../lib/texts';
import { createRuleSetVersion, getCurrentRuleSet, parameterRefusalToError } from '../../rulesets';
import { ruleChangeTitle, ruleLabel, ruleValue } from '../../rulesets/rule-display';
import { postSystemMessage } from '../../chat';
import { ledgerEventsPort, moneyPort } from '../governance-ports';
import { proposalError } from '../proposals.errors';
import { defineProposal } from './definition';

const input = z.strictObject({ changes: ruleChangesSchema });
const payload = z.strictObject({
  changes: ruleChangesSchema,
  /** The values when the proposal was made, for its title. */
  from: ruleChangesSchema,
});
type Payload = z.infer<typeof payload>;

function entries(changes: Payload['changes']): ParameterName[] {
  return (Object.keys(changes) as ParameterName[]).sort();
}

function joinTitles(titles: Bilingual[]): Bilingual {
  return { fr: titles.map((t) => t.fr).join(' ; '), en: titles.map((t) => t.en).join('; ') };
}

async function openParameters(db: Db, groupId: string) {
  const open = await db.proposal.findMany({
    where: { groupId, type: 'RULE_CHANGE', status: 'OPEN' },
    select: { payload: true },
  });
  return open.flatMap((p) =>
    Object.keys((p.payload as { changes?: object }).changes ?? {}),
  ) as ParameterName[];
}

export const ruleChange = defineProposal({
  type: 'RULE_CHANGE',
  input,
  payload,

  async plan(ctx, args) {
    const check = validateRuleChange({
      current: ctx.params,
      changes: args.changes as Partial<RuleSetParams>,
      openRuleChangeParameters: await openParameters(ctx.db, ctx.group.id),
    });
    if (!check.ok) {
      switch (check.code) {
        case 'EMPTY_RULE_CHANGE':
          throw proposalError('RULE_CHANGE_EMPTY');
        case 'NO_CHANGE':
          throw proposalError('RULE_CHANGE_NO_CHANGE', {
            params: { rule: ruleLabel(check.parameter) },
          });
        case 'RULE_CHANGE_ALREADY_OPEN':
          throw proposalError('RULE_CHANGE_ALREADY_OPEN', {
            params: { rule: ruleLabel(check.parameter) },
          });
        default:
          throw parameterRefusalToError(check);
      }
    }
    const from = Object.fromEntries(check.effects.map((e) => [e.parameter, e.from]));
    return {
      payload: { changes: args.changes, from },
      subjectMembershipId: null,
      excludedMembershipId: null,
      mustApprove: [],
      notes: [ui((c) => c.newProposal.rule.effectNextRound)],
    };
  },

  describe(p) {
    const changes = entries(p.changes).map((parameter) => {
      const from = (p.from as Partial<RuleSetParams>)[parameter];
      const to = (p.changes as Partial<RuleSetParams>)[parameter];
      return {
        parameter,
        from,
        to,
        label: ruleLabel(parameter),
        title: ruleChangeTitle(parameter, from!, to!),
      };
    });
    return {
      title: joinTitles(changes.map((c) => c.title)),
      subject: {
        type: 'RULE_CHANGE',
        changes: changes.map(({ parameter, from, to, label }) => ({ parameter, from, to, label })),
      },
    };
  },

  async apply(ctx, p) {
    const latest = await getCurrentRuleSet(ctx.group.id, ctx.tx);
    const previous = latest.params as unknown as RuleSetParams;
    const next = applyRuleChange(previous, p.changes as Partial<RuleSetParams>);
    const version = latest.version + 1;
    const created = await createRuleSetVersion(ctx.tx, {
      groupId: ctx.group.id,
      version,
      params: next,
      createdByProposalId: ctx.proposal.id,
    });
    const port = moneyPort();
    if (!port) throw proposalError('PROPOSAL_TYPE_UNAVAILABLE');
    const placed = await port.applyRuleSet(ctx.tx, {
      groupId: ctx.group.id,
      version,
      previous,
      next,
      proposalId: ctx.proposal.id,
    });
    if (placed?.effectiveFromRoundId) {
      await ctx.tx.ruleSet.update({
        where: { id: created.id },
        data: { effectiveFromRoundId: placed.effectiveFromRoundId },
      });
    }
    await ledgerEventsPort().appendEvent(ctx.tx, {
      groupId: ctx.group.id,
      event: { event: 'RULE_SET_APPLIED', version, proposalId: ctx.proposal.id },
      description: ui((c) => c.votes.types.RULE_CHANGE),
      refType: 'Proposal',
      refId: ctx.proposal.id,
      occurredAt: ctx.now,
    });
    const round = placed?.effectiveFromRoundNumber ?? null;
    const titles = entries(p.changes).map((parameter) =>
      ui((c) => c.votes.titles.ruleChange, {
        rule: ruleLabel(parameter),
        from: ruleValue(parameter, (p.from as Partial<RuleSetParams>)[parameter]!),
        to: ruleValue(parameter, (p.changes as Partial<RuleSetParams>)[parameter]!),
      }),
    );
    if (round !== null) {
      await postSystemMessage(
        ctx.group.id,
        ui((c) => c.chat.system.ruleApplied, { round, rule: joinTitles(titles) }),
        ctx.effects,
        ctx.tx,
      );
      return ui((c) => c.votes.card.effect.pending, { round });
    }
    return ui((c) => c.newProposal.rule.effectNextRound);
  },
});
