import {
  refreshResponseSchema,
  type AuthResponse,
  type SessionDto,
} from '@njangi/shared/contracts/auth';
import { selfSchema } from '@njangi/shared/contracts/me';
import { z } from 'zod';
import { setLanguage } from '@/i18n';
import { useSession } from '@/state/session';
import {
  accessTokenStore,
  api,
  ApiError,
  NETWORK_UNAVAILABLE,
  refreshAccessToken,
  setRefreshHandler,
} from './client';
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

/** True when a failure says nothing about the session: no network, or the server is down. */
function isUnreachable(error: unknown): boolean {
  return error instanceof ApiError && (error.code === NETWORK_UNAVAILABLE || error.status >= 500);
}

let lastRefreshUnreachable = false;

/**
 * Exchanges the refresh token for a new session. False when it did not work. Only a refusal by
 * the server (expired after 30 idle minutes, revoked, reused) ends the session; a dropped
 * connection or a server hiccup keeps it so the next request can try again (D27).
 */
async function refreshSession(): Promise<boolean> {
  lastRefreshUnreachable = false;
  const refreshToken = refreshStore.holdsToken ? await refreshStore.get() : undefined;
  if (refreshStore.holdsToken && !refreshToken) return false;
  try {
    const { session } = await api.post('/v1/auth/refresh', refreshToken ? { refreshToken } : {}, {
      auth: false,
      schema: refreshResponseSchema,
    });
    await applySession(session);
    return true;
  } catch (error) {
    if (isUnreachable(error)) {
      lastRefreshUnreachable = true;
      return false;
    }
    if (useSession.getState().status === 'signedIn') {
      await clearLocalSession();
      useSession.getState().setSignedOut();
    }
    return false;
  }
}

setRefreshHandler(refreshSession);

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** At launch: resume the previous session if the server still accepts it. */
export async function restoreSession(): Promise<void> {
  // A reload must not look like a log-out: retry briefly when the network or server hiccups.
  let unreachable = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await wait(1000 * attempt);
    try {
      if (!accessTokenStore.get() && !(await refreshAccessToken())) {
        unreachable = lastRefreshUnreachable;
        if (unreachable) continue;
        break;
      }
      // A 401 here refreshes once inside the client and repeats the request.
      const { user } = await api.get('/v1/me', { schema: meResponseSchema });
      useSession.getState().setSignedIn(user);
      // The member's saved language wins over the device's (spec 1.6).
      void setLanguage(user.language);
      void connectSocket();
      return;
    } catch (error) {
      unreachable = isUnreachable(error) || lastRefreshUnreachable;
      if (!unreachable) break;
    }
  }
  // Still offline: show the sign-in screen but keep the stored session for the next launch.
  if (!unreachable) await clearLocalSession();
  useSession.getState().setSignedOut();
}

/** After sign-up, login or accepting an invite. */
export async function signIn(response: AuthResponse): Promise<void> {
  await applySession(response.session);
  useSession.getState().setSignedIn(response.user);
  void setLanguage(response.user.language);
  void connectSocket();
}

/** "Se déconnecter", or "Se déconnecter partout" to revoke every device (spec 2.10). */
export async function signOut(options: { everywhere?: boolean } = {}): Promise<void> {
  const refreshToken = refreshStore.holdsToken ? await refreshStore.get() : undefined;
  try {
    await api.post(
      options.everywhere ? '/v1/auth/logout-all' : '/v1/auth/logout',
      refreshToken ? { refreshToken } : {},
    );
  } catch {
    // Signing out locally must work even when the server can't be reached.
  }
  await clearLocalSession();
  useSession.getState().setSignedOut();
}
