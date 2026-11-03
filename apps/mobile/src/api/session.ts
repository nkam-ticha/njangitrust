import { refreshResponseSchema, type AuthResponse, type SessionDto } from '@njangi/shared/contracts/auth';
import { selfSchema } from '@njangi/shared/contracts/me';
import { z } from 'zod';
import { useSession } from '@/state/session';
import { accessTokenStore, api, setRefreshHandler } from './client';
import { queryClient } from './queryClient';
import { refreshStore } from './refreshStore';
import { connectSocket, disconnectSocket } from './socket';

// Session lifecycle (spec 2.10, D1): access token in memory, refresh token in
// SecureStore on phones or an httpOnly cookie on web, rotated on every refresh.

const meResponseSchema = z.strictObject({ user: selfSchema });

async function applySession(session: SessionDto): Promise<void> {
  accessTokenStore.set(session.accessToken);
  if (session.refreshToken) await refreshStore.set(session.refreshToken);
}

async function clearLocalSession(): Promise<void> {
  accessTokenStore.set(null);
  await refreshStore.clear();
  disconnectSocket();
  // Nothing from one member's session may remain for the next person on this device.
  queryClient.clear();
}

/** Exchanges the refresh token for a new session. False when the session is over. */
async function refreshSession(): Promise<boolean> {
  const refreshToken = refreshStore.holdsToken ? await refreshStore.get() : undefined;
  if (refreshStore.holdsToken && !refreshToken) return false;
  try {
    const { session } = await api.post('/v1/auth/refresh', refreshToken ? { refreshToken } : {}, {
      auth: false,
      schema: refreshResponseSchema,
    });
    await applySession(session);
    return true;
  } catch {
    // A rejected refresh (expired, revoked, reused) ends the session on this device.
    if (useSession.getState().status === 'signedIn') {
      await clearLocalSession();
      useSession.getState().setSignedOut();
    }
    return false;
  }
}

setRefreshHandler(refreshSession);

/** At launch: resume the previous session if the server still accepts it. */
export async function restoreSession(): Promise<void> {
  if (await refreshSession()) {
    try {
      const { user } = await api.get('/v1/me', { schema: meResponseSchema });
      useSession.getState().setSignedIn(user);
      connectSocket();
      return;
    } catch {
      // Offline at launch with a valid token is handled once offline persistence lands;
      // for now the member signs in again.
    }
  }
  await clearLocalSession();
  useSession.getState().setSignedOut();
}

/** After sign-up, login or accepting an invite. */
export async function signIn(response: AuthResponse): Promise<void> {
  await applySession(response.session);
  useSession.getState().setSignedIn(response.user);
  connectSocket();
}

/** "Se déconnecter", or "Se déconnecter partout" to revoke every device (spec 2.10). */
export async function signOut(options: { everywhere?: boolean } = {}): Promise<void> {
  const refreshToken = refreshStore.holdsToken ? await refreshStore.get() : undefined;
  try {
    await api.post(options.everywhere ? '/v1/auth/logout-all' : '/v1/auth/logout', refreshToken ? { refreshToken } : {});
  } catch {
    // Signing out locally must work even when the server can't be reached.
  }
  await clearLocalSession();
  useSession.getState().setSignedOut();
}
