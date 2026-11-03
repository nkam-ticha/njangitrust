// Socket.IO events (spec 2.8). Rooms: `group:<id>` and `user:<id>`; a client joins only rooms it
// is authorised for. The access token goes in the handshake: `io(url, { auth: { token } })`.
import type { MessageDto } from './chat';
import type { NotificationDto } from './notifications';
import type { PendingActionDto } from './pending-actions';
import type { ProposalDto } from './proposals';

/** `pendingAction.updated`: the card's new state. */
export interface PendingActionUpdatedPayload {
  id: PendingActionDto['id'];
  status: PendingActionDto['status'];
  result: PendingActionDto['result'];
  failure: PendingActionDto['failure'];
}

/** `proposal.updated`: status and tallies; participation only for an open secret vote. */
export interface ProposalUpdatedPayload {
  id: ProposalDto['id'];
  groupId: ProposalDto['groupId'];
  status: ProposalDto['status'];
  participation: ProposalDto['participation'];
  tally: ProposalDto['tally'];
}

export interface ServerToClientEvents {
  'message.created': (message: MessageDto) => void;
  'message.deleted': (payload: { id: string; groupId: string }) => void;
  'message.hidden': (payload: { id: string; groupId: string }) => void;
  'proposal.updated': (payload: ProposalUpdatedPayload) => void;
  'notification.created': (notification: NotificationDto) => void;
  'pendingAction.updated': (payload: PendingActionUpdatedPayload) => void;
  /** Sent just before the server closes the socket (token expired, logged out everywhere). */
  'session.ended': (payload: { reason: 'TOKEN_EXPIRED' | 'LOGGED_OUT' }) => void;
}

/** Acknowledgement of a room request: joined, or a stable refusal code. */
export type RoomAck = { ok: true } | { ok: false; code: 'GROUP_NOT_FOUND' | 'MEMBERSHIP_ENDED' | 'INVALID' };

export interface ClientToServerEvents {
  'group.join': (groupId: string, ack: (result: RoomAck) => void) => void;
  'group.leave': (groupId: string, ack: (result: RoomAck) => void) => void;
}

export const REALTIME_EVENTS = [
  'message.created',
  'message.deleted',
  'message.hidden',
  'typing',
  'round.updated',
  'ledger.appended',
  'proposal.updated',
  'notification.created',
  'pendingAction.updated',
  'agent.delta',
  'agent.done',
] as const;
