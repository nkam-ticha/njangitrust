// Agent tool for invites (spec 4.6, 2.10): the same INVITE_CREATE card as POST /groups/:id/invites.
// The phone is hashed by the service; the one-time link is returned only to the confirming app.
import { createInviteRequestSchema } from '@njangi/shared/contracts/invites';
import { prepared } from '../../agent/tools/outcomes';
import { needGroup, serviceActor } from '../../agent/tools/resolve-group';
import { SPECS } from '../../agent/tools/specs';
import { implement } from '../../agent/tools/types';
import { requestInvite } from './invites.service';

export const inviteTools = [
  implement(SPECS.create_invite, async (ctx, a) => {
    const noGroup = needGroup(ctx);
    if (noGroup) return noGroup;
    const request = createInviteRequestSchema.parse(a);
    return prepared(await requestInvite(serviceActor(ctx), ctx.groupId!, request), ctx.lang);
  }),
];
