// Socket.IO (spec 2.8). The access token is checked in the handshake (same checks as REST); the
// socket joins its own `user:<id>` room, and `group:<id>` rooms only after `can()` allows it.
// The socket is closed when its token expires; the app reconnects with a fresh one.
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  RoomAck,
  ServerToClientEvents,
} from '@njangi/shared/contracts/realtime';
import { clock } from '../lib/clock';
import { componentLogger } from '../lib/logger';
import { loadGroupActor } from '../permissions/group-access';
import { can } from '../permissions/can';
import { verifyAccessSession } from '../modules/auth/sessions';
import {
  attachRealtimeServer,
  groupRoom,
  sessionRoom,
  userRoom,
  type RealtimeServer,
} from './emitter';

const log = componentLogger('realtime');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SocketData {
  userId: string;
  /** The refresh-token family (one login); revoking it closes this socket (M5). */
  sessionId: string;
}

async function joinGroup(userId: string, groupId: unknown): Promise<RoomAck> {
  if (typeof groupId !== 'string' || !UUID.test(groupId)) return { ok: false, code: 'INVALID' };
  const { group, actor } = await loadGroupActor(userId, groupId);
  if (!group) return { ok: false, code: 'GROUP_NOT_FOUND' };
  const decision = can(actor, 'group.realtime.join', {
    kind: 'group',
    groupId,
    status: group.status,
  });
  if (decision.allowed) return { ok: true };
  return {
    ok: false,
    code: decision.reason === 'NOT_A_MEMBER' ? 'GROUP_NOT_FOUND' : 'MEMBERSHIP_ENDED',
  };
}

export function createRealtimeServer(
  httpServer: HttpServer,
  options: { origins: readonly string[] },
): RealtimeServer {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    path: '/v1/realtime',
    cors: { origin: [...options.origins], credentials: true },
    serveClient: false,
    maxHttpBufferSize: 16_384,
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  /** Verifies the handshake token and closes the socket when that token expires. */
  async function authenticate(
    socket: Parameters<Parameters<typeof io.use>[0]>[0],
  ): Promise<boolean> {
    const token: unknown = (socket.handshake.auth as { token?: unknown }).token;
    const session =
      typeof token === 'string' && token.length < 2_048 ? await verifyAccessSession(token) : null;
    if (!session) return false;
    socket.data.userId = session.userId;
    socket.data.sessionId = session.sessionId;
    const timer = setTimeout(
      () => {
        socket.emit('session.ended', { reason: 'TOKEN_EXPIRED' });
        socket.disconnect(true);
      },
      Math.max(0, session.expiresAt.getTime() - clock.nowMs()),
    );
    socket.on('disconnect', () => clearTimeout(timer));
    return true;
  }

  io.use((socket, next) => {
    authenticate(socket).then(
      (ok) => next(ok ? undefined : new Error('UNAUTHENTICATED')),
      () => next(new Error('UNAUTHENTICATED')),
    );
  });

  io.on('connection', (socket) => {
    const { userId } = socket.data;
    void socket.join([userRoom(userId), sessionRoom(socket.data.sessionId)]);

    socket.on('group.join', async (groupId, ack) => {
      try {
        let result = await joinGroup(userId, groupId);
        if (result.ok) {
          await socket.join(groupRoom(groupId));
          // L-3: a membership that ended between the check and the join (its leaveGroupRoom ran
          // before this socket was in the room) is caught by checking again once joined.
          result = await joinGroup(userId, groupId);
          if (!result.ok) await socket.leave(groupRoom(groupId));
        }
        if (typeof ack === 'function') ack(result);
      } catch (error) {
        log.error({ err: error }, 'group.join failed');
        if (typeof ack === 'function') ack({ ok: false, code: 'INVALID' });
      }
    });

    socket.on('group.leave', async (groupId, ack) => {
      if (typeof groupId === 'string' && UUID.test(groupId)) await socket.leave(groupRoom(groupId));
      if (typeof ack === 'function') ack({ ok: true });
    });
  });

  attachRealtimeServer(io);
  return io;
}
