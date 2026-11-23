// Agent tool for invites (spec 4.6, 2.10): the same INVITE_CREATE card as POST /groups/:id/invites.
// The phone is hashed by the service; the one-time link is returned only to the confirming app.
import { formatDateTime } from '@njangi/shared';
import { createInviteRequestSchema } from '@njangi/shared/contracts/invites';
import { ok, prepared } from '../../agent/tools/outcomes';
import { needGroup, serviceActor } from '../../agent/tools/resolve-group';
import { SPECS } from '../../agent/tools/specs';
import { implement } from '../../agent/tools/types';
import { toInviteListItem } from '../../dto';
import { clock } from '../../lib/clock';
import { listInvites, requestInvite } from './invites.service';

export const inviteTools = [
  // Same call and mapper as GET /groups/:id/invites: names and statuses, never a phone or a link.
  implement(SPECS.list_invites, async (ctx) => {
    const noGroup = needGroup(ctx);
    if (noGroup) return noGroup;
    const now = clock.now();
    const invites = await listInvites(ctx.userId, ctx.groupId!);
    return ok({
      invites: invites
        .slice(0, 30)
        .map((i) => toInviteListItem(i, now))
        .map((i) => ({
          name: i.inviteeName,
          status: i.status,
          foundingMember: i.founding,
          expires: formatDateTime(i.expiresAt, ctx.lang),
        })),
    });
  }),
  implement(SPECS.create_invite, async (ctx, a) => {
    const noGroup = needGroup(ctx);
    if (noGroup) return noGroup;
    const request = createInviteRequestSchema.parse(a);
    return prepared(await requestInvite(serviceActor(ctx), ctx.groupId!, request), ctx.lang);
  }),
];
