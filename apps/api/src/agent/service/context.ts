// Builds the turn context from the authenticated session (spec 4.2): who is acting, their role in
// the active group (checked with can()), their own numbers for the output guard, the language of
// their latest message. Nothing here can come from the model.
import { randomUUID } from 'node:crypto';
import type { AgentChannel } from '@njangi/shared/contracts/agent';
import { clock } from '../../lib/clock';
import { getSelfSource } from '../../modules/me';
import { authorizeGroup, type AuthActor } from '../../permissions';
import { detectLanguage } from '../guards/language';
import { NumberSlots } from '../guards/number-slots';
import type { AgentCtx } from '../types';

export async function buildCtx(
  actor: AuthActor,
  input: {
    groupId: string | null;
    channel: AgentChannel;
    text: string | null;
    /** Group chat only: the message this mention replied to, if any (spec 4.8 point 6). */
    quotedMessage?: { author: string; text: string } | null;
  },
): Promise<AgentCtx> {
  const self = await getSelfSource(actor.userId);
  let group: { name: string; role: AgentCtx['role']; membershipId: string } | null = null;
  if (input.groupId) {
    // Same check as GET /groups/:id: a non-member gets "not found".
    const access = await authorizeGroup(actor.userId, input.groupId, 'group.read');
    group = {
      name: access.group.name,
      role: access.membership.role,
      membershipId: access.membership.id,
    };
  }
  const fallback = self.user.language;
  // In the group chat everyone reads the reply: no number at all goes through, not even theirs.
  const ownPhones =
    input.channel === 'GROUP'
      ? []
      : [self.user.loginPhone, ...(self.paymentNumber ? [self.paymentNumber.number] : [])];
  return Object.freeze({
    actor,
    userId: actor.userId,
    groupId: input.groupId,
    groupName: group?.name ?? null,
    channel: input.channel,
    role: group?.role ?? null,
    membershipId: group?.membershipId ?? null,
    lang: input.text ? detectLanguage(input.text, fallback) : fallback,
    name: self.user.name,
    firstName: self.user.name.split(/\s+/)[0] ?? self.user.name,
    ownPhones,
    numberSlots: new NumberSlots(),
    ...(input.quotedMessage !== undefined ? { quotedMessage: input.quotedMessage } : {}),
    turnId: randomUUID(),
    now: clock.now(),
  });
}
