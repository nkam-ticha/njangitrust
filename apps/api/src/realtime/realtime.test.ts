// Spec 2.8: JWT in the handshake, own user room, group rooms only when authorised.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RoomAck } from '@njangi/shared/contracts/realtime';
import { testApp } from '../../test/helpers/app';
import { addMember, createGroup, signUp } from '../../test/helpers/factories';
import { api, type TestUser } from '../../test/helpers/client';
import { attachRealtimeServer, emitToGroup } from './emitter';
import { createRealtimeServer } from './socket-server';

let server: Server;
let url: string;
const sockets: Socket[] = [];

function open(token: string): Socket {
  const socket = connect(url, {
    path: '/v1/realtime',
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });
  sockets.push(socket);
  return socket;
}

const connected = (socket: Socket) =>
  new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', (error) => reject(error));
  });

const join = (socket: Socket, groupId: string) =>
  new Promise<RoomAck>((resolve) =>
    socket.emit('group.join', groupId, (ack: RoomAck) => resolve(ack)),
  );

beforeAll(async () => {
  server = createServer(testApp());
  const io = createRealtimeServer(server, { origins: [] });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await io.close();
    attachRealtimeServer(null);
  });
});

describe('Socket.IO rooms (spec 2.8)', () => {
  let admin: TestUser;
  let member: TestUser;
  let groupId: string;

  beforeAll(async () => {
    admin = await signUp();
    groupId = (await createGroup(admin)).groupId;
    member = await addMember(admin, groupId);
  });

  it('refuses a connection without a valid access token', async () => {
    await expect(connected(open('not-a-token'))).rejects.toThrow('UNAUTHENTICATED');
  });

  it('joins a group room only for a member, and delivers group events there', async () => {
    const socket = open(member.accessToken);
    await connected(socket);
    expect(await join(socket, groupId)).toEqual({ ok: true });
    const received = new Promise((resolve) => socket.on('message.created', resolve));
    emitToGroup(groupId, 'message.created', {
      id: '6b1f0a2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
      groupId,
      kind: 'SYSTEM',
      text: null,
      systemText: { fr: 'Bonjour', en: 'Hello' },
      author: null,
      createdAt: new Date(0).toISOString(),
      attachment: null,
      replyTo: null,
      mentions: [],
      isAnnouncement: false,
      removed: null,
    });
    await expect(received).resolves.toMatchObject({ groupId });
  });

  it('refuses the room of a group the user is not in', async () => {
    const outsider = await signUp();
    const socket = open(outsider.accessToken);
    await connected(socket);
    expect(await join(socket, groupId)).toEqual({ ok: false, code: 'GROUP_NOT_FOUND' });
    expect(await join(socket, 'not-a-uuid')).toEqual({ ok: false, code: 'INVALID' });
  });

  it('closes the socket of a session that logs out or is caught reusing a token (M5)', async () => {
    const user = await signUp();
    const socket = open(user.accessToken);
    await connected(socket);
    const closed = new Promise((resolve) => socket.on('disconnect', resolve));
    await api(user).post('/v1/auth/logout', { refreshToken: user.refreshToken });
    await expect(closed).resolves.toBeDefined();

    const thief = await signUp();
    const watcher = open(thief.accessToken);
    await connected(watcher);
    const ended = new Promise((resolve) => watcher.on('disconnect', resolve));
    await api().post('/v1/auth/refresh', { refreshToken: thief.refreshToken });
    await api().post('/v1/auth/refresh', { refreshToken: thief.refreshToken });
    await expect(ended).resolves.toBeDefined();
  });
});
