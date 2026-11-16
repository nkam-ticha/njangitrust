// Agent tools for the member's own account (spec 4.6): groups, language, active group, and the
// payment number as an information card (spec 4.5): the model only ever gets its masked form.
import { formatDateLong } from '@njangi/shared';
import { agentErrorTexts } from '@njangi/shared/i18n/server/agent';
import { agentPorts } from '../../agent/ports';
import { ok, refused } from '../../agent/tools/outcomes';
import { matchName } from '../../agent/tools/resolve-group';
import { SPECS } from '../../agent/tools/specs';
import { implement } from '../../agent/tools/types';
import { toMyGroup, toSelf } from '../../dto';
import { getSelfSource, listMyGroups, updateMe } from './me.service';

const READABLE = new Set(['INVITED', 'ACTIVE', 'LEAVING']);

export const meTools = [
  implement(SPECS.list_my_groups, async (ctx) => {
    const groups = await listMyGroups(ctx.userId);
    return ok({
      groups: groups.map((g) => {
        const dto = toMyGroup(g.group, g.membership, g.memberCount);
        return {
          name: dto.name,
          myRole: dto.role,
          myStatus: dto.membershipStatus,
          groupStatus: dto.status,
          members: dto.memberCount,
          ...(dto.groupId === ctx.groupId ? { active: true } : {}),
        };
      }),
    });
  }),
  implement(SPECS.get_my_payment_number, async (ctx) => {
    const self = toSelf(await getSelfSource(ctx.userId));
    const money = agentPorts().money;
    const hold = money && ctx.groupId ? await money.holdLine(ctx) : null;
    return ok(
      self.paymentNumber
        ? {
            shownAsCard: true,
            masked: self.paymentNumber.masked,
            operator: self.paymentNumber.operator,
            since: formatDateLong(self.paymentNumber.activeFrom, ctx.lang, { withYear: true }),
            ...(hold ? { hold } : {}),
          }
        : { shownAsCard: true, paymentNumber: null },
      { card: { type: 'PAYMENT_NUMBER' } },
    );
  }),
  implement(SPECS.set_language, async (ctx, a) => {
    await updateMe(ctx.userId, { language: a.language });
    return ok({ language: a.language });
  }),
  implement(SPECS.switch_group, async (ctx, a) => {
    const groups = (await listMyGroups(ctx.userId)).filter((g) =>
      READABLE.has(g.membership.status),
    );
    const match = matchName(
      a.group,
      groups.map((g) => g.group.name),
    );
    if (typeof match !== 'number') {
      return refused('GROUP_NOT_FOUND', agentErrorTexts.GROUP_NOT_FOUND[ctx.lang], {
        groups: groups.map((g) => g.group.name),
      });
    }
    const chosen = groups[match]!;
    return ok(
      { activeGroup: chosen.group.name, myRole: chosen.membership.role },
      { activeGroupId: chosen.group.id },
    );
  }),
];
