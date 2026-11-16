// Agent tools for proposals and votes (spec 4.6). Same shape as proposals.routes.ts: validate with
// the same contracts, call the same services, map with the same DTOs (then the agent allowlist).
// The member acts as `ctx` only; a secret vote's turn is marked confidential so its choice is never
// stored (R11.5).
import { createProposalRequestSchema } from '@njangi/shared/contracts/proposals';
import { proposalErrorTexts } from '@njangi/shared/i18n/server/proposals';
import { toAgentProposal } from '../../agent/dto/governance';
import { ok, prepared, refused } from '../../agent/tools/outcomes';
import { needGroup, serviceActor } from '../../agent/tools/resolve-group';
import { resolveMember } from '../../agent/tools/resolve-member';
import { SPECS } from '../../agent/tools/specs';
import { implement, type ToolOutcome } from '../../agent/tools/types';
import type { AgentCtx } from '../../agent/types';
import { toProposal } from '../../dto';
import { getProposal, listProposals, requestProposal, requestVote } from './proposals.service';

/** Prepares a PROPOSAL_CREATE card from a request shaped like POST /groups/:id/proposals. */
async function propose(ctx: AgentCtx, body: Record<string, unknown>): Promise<ToolOutcome> {
  const noGroup = needGroup(ctx);
  if (noGroup) return noGroup;
  const request = createProposalRequestSchema.parse(body);
  const action = await requestProposal(serviceActor(ctx), ctx.groupId!, request, 'AGENT');
  return prepared(action, ctx.lang);
}

/** Resolves named members first; a refusal (unknown or ambiguous name) stops here. */
async function withMembers(
  ctx: AgentCtx,
  names: string[],
  then: (ids: string[]) => Promise<ToolOutcome>,
): Promise<ToolOutcome> {
  const noGroup = needGroup(ctx);
  if (noGroup) return noGroup;
  const ids: string[] = [];
  for (const name of names) {
    const resolved = await resolveMember(ctx, ctx.groupId!, name);
    if ('outcome' in resolved) return resolved.outcome;
    ids.push(resolved.membershipId);
  }
  return then(ids);
}

/** A proposal of the active group, or the service's "not found". */
async function activeGroupProposal(ctx: AgentCtx, id: string) {
  const view = await getProposal(ctx.userId, id);
  return view.proposal.groupId === ctx.groupId ? view : null;
}

const notFound = (ctx: AgentCtx) =>
  refused('PROPOSAL_NOT_FOUND', proposalErrorTexts.PROPOSAL_NOT_FOUND[ctx.lang]);

export const proposalTools = [
  implement(SPECS.list_proposals, async (ctx, a) => {
    const noGroup = needGroup(ctx);
    if (noGroup) return noGroup;
    const views = await listProposals(ctx.userId, ctx.groupId!, a);
    return ok({
      proposals: views
        .slice(0, 20)
        .map((v) => toAgentProposal(toProposal(v), ctx.lang, ctx.channel)),
    });
  }),
  implement(SPECS.get_proposal, async (ctx, a) => {
    const view = await activeGroupProposal(ctx, a.id);
    if (!view) return notFound(ctx);
    return ok({ proposal: toAgentProposal(toProposal(view), ctx.lang, ctx.channel) });
  }),
  implement(SPECS.cast_vote, async (ctx, a) => {
    const view = await activeGroupProposal(ctx, a.proposalId);
    if (!view) return notFound(ctx);
    const choice = a.choice === 'yes' ? 'YES' : 'NO';
    const action = await requestVote(serviceActor(ctx), a.proposalId, { choice }, 'AGENT');
    return prepared(action, ctx.lang, { confidential: view.proposal.secret });
  }),
  implement(SPECS.propose_rule_change, (ctx, a) =>
    propose(ctx, {
      type: 'RULE_CHANGE',
      changes: a.changes,
      ...(a.reason ? { reason: a.reason } : {}),
    }),
  ),
  implement(SPECS.propose_member_add, (ctx, a) =>
    propose(ctx, {
      type: 'MEMBER_ADD',
      name: a.name,
      phone: a.phone,
      ...(a.reason ? { reason: a.reason } : {}),
    }),
  ),
  implement(SPECS.propose_member_removal, (ctx, a) =>
    withMembers(ctx, [a.member], ([id]) =>
      propose(ctx, { type: 'MEMBER_REMOVE', membershipId: id, reason: a.reason }),
    ),
  ),
  implement(SPECS.propose_rotation_change, (ctx, a) =>
    withMembers(ctx, a.swap, (ids) =>
      propose(ctx, {
        type: 'ROTATION_CHANGE',
        swap: ids,
        ...(a.reason ? { reason: a.reason } : {}),
      }),
    ),
  ),
  implement(SPECS.propose_admin_change, (ctx, a) =>
    withMembers(ctx, [a.member], ([id]) =>
      propose(ctx, {
        type: 'ADMIN_CHANGE',
        membershipId: id,
        ...(a.reason ? { reason: a.reason } : {}),
      }),
    ),
  ),
  implement(SPECS.propose_fine_waiver, (ctx, a) =>
    propose(ctx, { type: 'FINE_WAIVER', fineId: a.fineId, reason: a.reason }),
  ),
  implement(SPECS.propose_ledger_correction, (ctx, a) =>
    propose(ctx, {
      type: 'LEDGER_CORRECTION',
      seq: a.seq,
      correction: a.correction,
      reason: a.reason,
    }),
  ),
  implement(SPECS.request_early_exit, (ctx, a) =>
    propose(ctx, { type: 'EARLY_EXIT', reason: a.reason }),
  ),
];
