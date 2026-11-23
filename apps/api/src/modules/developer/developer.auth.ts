// The developer's session token (D28). Its own signing key, audience and claim: a member's access
// token never opens a developer route, and a developer token is never valid for a member route
// (their key and audience differ). It lives 30 minutes and is never renewed: when it ends, the
// developer logs in again. The username must still be the configured one on every request, so
// removing the credentials from the environment ends every developer session at once.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import type { RequestHandler } from 'express';
import { getEnv } from '../../config/env';
import { clock } from '../../lib/clock';
import { developerError } from './developer.errors';

export const DEVELOPER_TOKEN_TTL_SECONDS = 30 * 60;
const ISSUER = 'njangitrust-api';
const AUDIENCE = 'njangitrust-developer';
const ROLE = 'developer';
const ALGORITHM = 'HS256';
const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

function signingKey(): Uint8Array {
  const env = getEnv();
  const secret =
    env.DEVELOPER_JWT_SECRET ??
    createHmac('sha256', env.JWT_SECRET).update('njangitrust-developer-token-v1').digest('hex');
  return new TextEncoder().encode(secret);
}

/** Compares two texts in constant time (digests of equal length), whatever their lengths. */
export function sameText(a: string, b: string): boolean {
  const digest = (text: string) => createHmac('sha256', 'developer-compare').update(text).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export async function signDeveloperToken(
  username: string,
): Promise<{ token: string; expiresAt: Date }> {
  const issuedAt = Math.floor(clock.nowMs() / 1000);
  const expiresAtSeconds = issuedAt + DEVELOPER_TOKEN_TTL_SECONDS;
  const token = await new SignJWT({ role: ROLE })
    .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
    .setSubject(username)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAtSeconds)
    .setJti(randomUUID())
    .sign(signingKey());
  return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
}

/** The developer a valid token belongs to, or null. */
export async function verifyDeveloperToken(token: string): Promise<{ username: string } | null> {
  const configured = getEnv().DEVELOPER_USERNAME;
  if (!configured) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
      typ: 'JWT',
      currentDate: clock.now(),
      clockTolerance: 5,
      requiredClaims: ['sub', 'role', 'exp', 'iat', 'jti'],
    });
    if (payload.role !== ROLE || typeof payload.sub !== 'string') return null;
    if (!sameText(payload.sub, configured)) return null;
    return { username: payload.sub };
  } catch {
    return null;
  }
}

/** Requires a valid developer token. Never accepts a member's. */
export function requireDeveloper(): RequestHandler {
  return async (req, _res, next) => {
    const match = BEARER.exec(req.get('authorization') ?? '');
    const developer = match?.[1] ? await verifyDeveloperToken(match[1]) : null;
    if (!developer) throw developerError('DEVELOPER_UNAUTHENTICATED');
    req.developer = developer;
    next();
  };
}

export function developerOf(req: { developer?: { username: string } }): { username: string } {
  if (!req.developer) throw developerError('DEVELOPER_UNAUTHENTICATED');
  return req.developer;
}
