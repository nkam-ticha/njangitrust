// Access tokens (spec 2.10): JWT, 15 minutes, HS256 only, issuer and audience checked.
import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { getEnv } from '../../config/env';
import { clock } from '../../lib/clock';
import type { ClientKind } from '../../permissions/actor';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const ISSUER = 'njangitrust-api';
const AUDIENCE = 'njangitrust-app';
const ALGORITHM = 'HS256';

export interface AccessClaims {
  userId: string;
  /** Refresh-token family (one login). */
  sessionId: string;
  /** User.sessionEpoch when issued; a bump revokes every older token at once. */
  epoch: number;
  client: ClientKind;
  expiresAt: Date;
}

let cachedKey: { secret: string; key: Uint8Array } | undefined;

function signingKey(): Uint8Array {
  const secret = getEnv().JWT_SECRET;
  if (cachedKey?.secret !== secret) cachedKey = { secret, key: new TextEncoder().encode(secret) };
  return cachedKey.key;
}

export async function signAccessToken(
  claims: Omit<AccessClaims, 'expiresAt'>,
): Promise<{ token: string; expiresAt: Date }> {
  const issuedAt = Math.floor(clock.nowMs() / 1000);
  const expiresAtSeconds = issuedAt + ACCESS_TOKEN_TTL_SECONDS;
  const token = await new SignJWT({ sid: claims.sessionId, sv: claims.epoch, cli: claims.client })
    .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAtSeconds)
    .setJti(randomUUID())
    .sign(signingKey());
  return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
}

/** The claims of a valid token, or null (bad signature, other algorithm, expired, wrong audience). */
export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
      typ: 'JWT',
      currentDate: clock.now(),
      clockTolerance: 5,
      requiredClaims: ['sub', 'sid', 'sv', 'exp', 'iat', 'jti'],
    });
    const { sub, sid, sv, cli, exp } = payload;
    if (typeof sub !== 'string' || typeof sid !== 'string' || typeof exp !== 'number') return null;
    if (typeof sv !== 'number' || !Number.isSafeInteger(sv)) return null;
    if (cli !== 'mobile' && cli !== 'web') return null;
    return { userId: sub, sessionId: sid, epoch: sv, client: cli, expiresAt: new Date(exp * 1000) };
  } catch {
    return null;
  }
}
