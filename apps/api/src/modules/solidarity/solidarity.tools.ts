// Agent tools for the solidarity fund (spec 4.6, R10): the fund and its requests through the
// solidarity service and mapper, and a request (SOLIDARITY_PAYOUT vote) through the proposals one.
import { solidarityRequestSchema } from '@njangi/shared/contracts/solidarity';
import { toAgentSolidarity } from '../../agent/dto/governance';
import { ok, prepared } from '../../agent/tools/outcomes';
import { needGroup, serviceActor } from '../../agent/tools/resolve-group';
import { resolveMember } from '../../agent/tools/resolve-member';
import { SPECS } from '../../agent/tools/specs';
import { implement } from '../../agent/tools/types';
import { toSolidarityRequest } from '../../dto';
import { requestSolidarity } from '../proposals';
import { readSolidarity } from './solidarity.service';

export const solidarityTools = [
  implement(SPECS.get_solidarity, async (ctx) => {
    const noGroup = needGroup(ctx);
    if (noGroup) return noGroup;
    const { fundBalance, requests } = await readSolidarity(ctx.userId, ctx.groupId!);
    return ok(toAgentSolidarity(fundBalance, requests.map(toSolidarityRequest), ctx.lang));
  }),
  implement(SPECS.request_solidarity, async (ctx, a) => {
    const noGroup = needGroup(ctx);
    if (noGroup) return noGroup;
    const recipient = await resolveMember(ctx, ctx.groupId!, a.recipient);
    if ('outcome' in recipient) return recipient.outcome;
    const request = solidarityRequestSchema.parse({
      recipientMembershipId: recipient.membershipId,
      event: a.event,
      amount: a.amount,
      ...(a.note ? { note: a.note } : {}),
    });
    const action = await requestSolidarity(serviceActor(ctx), ctx.groupId!, request, 'AGENT');
    return prepared(action, ctx.lang);
  }),
];
