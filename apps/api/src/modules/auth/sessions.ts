// Sessions: an access token plus a refresh-token family. Every authenticated request re-checks
// the user (not deleted), the epoch (not logged out everywhere) and the family (not logged out).
import type { Lang } from '@njangi/shared';
import { clock } from '../../lib/clock';
import { getPrisma, type Db } from '../../lib/prisma';
import type { AuthActor, ClientKind } from '../../permissions/actor';
import { signAccessToken, verifyAccessToken } from './access-tokens';
import { issueRefreshToken, type IssuedRefreshToken } from './refresh-tokens';

export interface SessionTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

async function tokensFor(
  user: { id: string; sessionEpoch: number },
  client: ClientKind,
  refresh: IssuedRefreshToken,
): Promise<SessionTokens> {
  const access = await signAccessToken({
    userId: user.id,
    sessionId: refresh.familyId,
    epoch: user.sessionEpoch,
    client,
  });
  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt,
  };
}

/** A new login: a new refresh-token family. Pass the transaction when one is open. */
export async function startSession(
  db: Db,
  user: { id: string; sessionEpoch: number },
  client: ClientKind,
): Promise<SessionTokens> {
  const refresh = await issueRefreshToken(db, { userId: user.id, client });
  return tokensFor(user, client, refresh);
}

/** After a rotation: the next access token of the same family. */
export async function continueSession(userId: string, client: ClientKind, refresh: IssuedRefreshToken) {
  const user = await getPrisma().user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, sessionEpoch: true },
  });
  return tokensFor(user, client, refresh);
}

/** The actor behind an access token, or null if the token or its session is no longer valid. */
export async function verifyAccessSession(token: string): Promise<(AuthActor & { expiresAt: Date }) | null> {
  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  const user = await getPrisma().user.findUnique({
    where: { id: claims.userId },
    select: {
      deletedAt: true,
      sessionEpoch: true,
      language: true,
      refreshTokens: {
        where: { familyId: claims.sessionId, revokedAt: null, expiresAt: { gt: clock.now() } },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!user || user.deletedAt) return null;
  if (user.sessionEpoch !== claims.epoch) return null;
  if (user.refreshTokens.length === 0) return null;
  return {
    userId: claims.userId,
    lang: user.language as Lang,
    sessionId: claims.sessionId,
    client: claims.client,
    expiresAt: claims.expiresAt,
  };
}
