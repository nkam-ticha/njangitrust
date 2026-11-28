// The context every tool runs in (spec 4.2). Built by the runtime from the authenticated session
// only: the acting member never comes from tool arguments or from the model.
import type { Lang } from '@njangi/shared';
import type { AgentChannel } from '@njangi/shared/contracts/agent';
import type { AuthActor, MembershipRole } from '../permissions';
import type { NumberSlots } from './guards/number-slots';

export interface AgentCtx {
  /** The verified session of the member; services act as `actor.userId`. */
  readonly actor: AuthActor;
  readonly userId: string;
  /** The member's active group (null before they join one). */
  readonly groupId: string | null;
  readonly groupName: string | null;
  readonly channel: AgentChannel;
  /** Role in the active group; null without a group. */
  readonly role: MembershipRole | null;
  readonly membershipId: string | null;
  /** Reply language of this turn (the member's latest message, else their app language). */
  readonly lang: Lang;
  readonly name: string;
  readonly firstName: string;
  /** The member's own numbers (login and payment): the only ones the output guard lets through. */
  readonly ownPhones: readonly string[];
  /** The numbers the member typed in this turn, as markers the model can pass on (never digits). */
  readonly numberSlots?: NumberSlots;
  /**
   * Group chat only: the message this mention replied to, if any. Carried as session data (spec
   * 4.8 point 6), never folded into the member's own message text, so it cannot pass as an
   * instruction or as something the member themselves wrote.
   */
  readonly quotedMessage?: { author: string; text: string } | null;
  readonly turnId: string;
  readonly now: Date;
}
