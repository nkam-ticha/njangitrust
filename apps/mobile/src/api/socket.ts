import { io, type Socket } from 'socket.io-client';
import { useConnectivity } from '@/state/connectivity';
import { accessTokenStore } from './client';
import { API_URL } from './config';

// One Socket.IO connection per signed-in session (spec 2.8). The server puts the
// client only in the rooms it is allowed to join (group:<id>, user:<id>).

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket {
  if (socket) return socket;
  socket = io(API_URL, {
    path: '/socket.io',
    transports: ['websocket'],
    // Re-read on every (re)connection so a refreshed access token is used.
    auth: (callback) => callback({ token: accessTokenStore.get() }),
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 30_000,
  });
  socket.on('connect', () => useConnectivity.getState().markOnline());
  socket.on('disconnect', (reason) => {
    // A disconnect we asked for (sign-out) is not "offline".
    if (reason !== 'io client disconnect') useConnectivity.getState().markOffline();
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
