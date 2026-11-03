// D1: mobile clients get the refresh token in the body (kept in SecureStore); web clients get it
// as an httpOnly, Secure, SameSite=Strict cookie scoped to /v1/auth and never see it in script.
// A request authenticated by that cookie must carry the X-Njangi-Client: web header (a cross-site
// form cannot set it, and CORS lets only configured origins send it) and an allowed Origin.
import type { Request, Response } from 'express';
import { CLIENT_HEADER } from '@njangi/shared/contracts/common';
import type { SessionDto } from '@njangi/shared/contracts/auth';
import { getEnv } from '../config/env';
import { commonError } from '../lib/errors';
import { iso } from '../dto';
import type { SessionTokens } from '../modules/auth/sessions';
import { REFRESH_TOKEN_TTL_DAYS } from '../modules/auth/refresh-tokens';
import { serializeCookie } from './cookies';

export const REFRESH_COOKIE = 'njangi_rt';
const COOKIE_PATH = '/v1/auth';

function setRefreshCookie(res: Response, token: string): void {
  res.append(
    'Set-Cookie',
    serializeCookie(REFRESH_COOKIE, token, {
      path: COOKIE_PATH,
      maxAge: REFRESH_TOKEN_TTL_DAYS * 86_400,
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
    }),
  );
}

export function clearRefreshCookie(res: Response): void {
  res.append(
    'Set-Cookie',
    serializeCookie(REFRESH_COOKIE, '', { path: COOKIE_PATH, maxAge: 0, httpOnly: true, secure: true, sameSite: 'Strict' }),
  );
}

/** The session part of a response, delivering the refresh token the right way for the client. */
export function deliverSession(req: Request, res: Response, tokens: SessionTokens): SessionDto {
  const base = {
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: iso(tokens.accessTokenExpiresAt),
    refreshTokenExpiresAt: iso(tokens.refreshTokenExpiresAt),
  };
  if (req.clientKind === 'web') {
    setRefreshCookie(res, tokens.refreshToken);
    return base;
  }
  return { ...base, refreshToken: tokens.refreshToken };
}

/** CSRF defence for cookie-authenticated requests (D1). */
export function assertCookieRequestAllowed(req: Request): void {
  if (req.get(CLIENT_HEADER) !== 'web') throw commonError('CSRF_HEADER_MISSING');
  const origin = req.get('origin');
  if (origin && !getEnv().WEB_ORIGINS.includes(origin)) throw commonError('ORIGIN_NOT_ALLOWED');
}

/**
 * The refresh token of a request: from the body (mobile) or the cookie (web, CSRF-checked).
 * A body token wins; both absent returns undefined.
 */
export function refreshTokenOf(req: Request, bodyToken: string | undefined): string | undefined {
  if (bodyToken) return bodyToken;
  const cookie = req.cookies[REFRESH_COOKIE];
  if (!cookie) return undefined;
  assertCookieRequestAllowed(req);
  return cookie;
}
