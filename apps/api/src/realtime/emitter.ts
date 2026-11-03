// Typed emitters for the rooms of spec 2.8. Services call these; when no Socket.IO server runs
// (unit tests, scripts) events go to an optional recorder instead.
import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@njangi/shared/contracts/realtime';

export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type EventName = keyof ServerToClientEvents;
export type EventPayload<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];

export interface RecordedEvent {
  room: string;
  event: EventName;
  payload: unknown;
}

let io: RealtimeServer | null = null;
let recorder: RecordedEvent[] | null = null;

export const userRoom = (userId: string) => `user:${userId}`;
export const groupRoom = (groupId: string) => `group:${groupId}`;

export function attachRealtimeServer(server: RealtimeServer | null): void {
  io = server;
}

export function getRealtimeServer(): RealtimeServer | null {
  return io;
}

/** Tests: start recording every emitted event; returns the live array. */
export function recordRealtimeEvents(): RecordedEvent[] {
  recorder = [];
  return recorder;
}

function emit<E extends EventName>(room: string, event: E, payload: EventPayload<E>): void {
  recorder?.push({ room, event, payload });
  if (!io) return;
  // Socket.IO's typed emit takes the listener's parameters.
  (io.to(room).emit as (event: E, payload: EventPayload<E>) => boolean)(event, payload);
}

export function emitToUser<E extends EventName>(userId: string, event: E, payload: EventPayload<E>): void {
  emit(userRoom(userId), event, payload);
}

export function emitToGroup<E extends EventName>(groupId: string, event: E, payload: EventPayload<E>): void {
  emit(groupRoom(groupId), event, payload);
}

/** Closes every socket of a user (log out everywhere, PIN change or reset, reuse detected). */
export function disconnectUser(userId: string): void {
  if (!io) return;
  io.in(userRoom(userId)).emit('session.ended', { reason: 'LOGGED_OUT' });
  io.in(userRoom(userId)).disconnectSockets(true);
}

/** Removes a user's sockets from a group room (membership ended). */
export function leaveGroupRoom(userId: string, groupId: string): void {
  io?.in(userRoom(userId)).socketsLeave(groupRoom(groupId));
}
