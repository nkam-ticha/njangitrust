// Ending a member's live access to a group when their membership ends (R12.4): their sockets
// leave the group room once the ending transaction commits. Used by governance (EARLY_EXIT,
// MEMBER_REMOVE) and by the cycle close of the money modules (LEAVING -> LEFT). REST access ends
// by itself: `can()` refuses an ended membership. The socket server re-checks after every join
// (privacy-guard L-3), so a join racing with the end cannot keep the room.
import type { EffectSink } from '../../lib/after-commit';
import { leaveGroupRoom } from '../../realtime/emitter';

/** Call inside the transaction that sets the membership LEFT or REMOVED. */
export function endMembershipAccess(
  effects: EffectSink,
  input: { userId: string; groupId: string },
): void {
  effects.add(() => leaveGroupRoom(input.userId, input.groupId));
}
