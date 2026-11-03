// Minimal cookie parsing and writing (no dependency). The only cookie the API uses is the web
// refresh token (D1): httpOnly, Secure, SameSite=Strict, scoped to /v1/auth.
import type { RequestHandler } from 'express';

const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const COOKIE_VALUE = /^[!#$%&'()*+\-./0-9:<=>?@A-Z[\]^_`a-z{|}~]*$/;

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = Object.create(null) as Record<string, string>;
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (!COOKIE_NAME.test(name) || name in cookies) continue;
    let value = part.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

export function cookieParser(): RequestHandler {
  return (req, _res, next) => {
    req.cookies = parseCookies(req.get('cookie'));
    next();
  };
}

export interface CookieOptions {
  path: string;
  /** Seconds; 0 deletes the cookie. */
  maxAge: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax';
}

export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  if (!COOKIE_NAME.test(name)) throw new Error('invalid cookie name');
  const encoded = encodeURIComponent(value);
  if (!COOKIE_VALUE.test(encoded)) throw new Error('invalid cookie value');
  const parts = [`${name}=${encoded}`, `Path=${options.path}`, `Max-Age=${Math.floor(options.maxAge)}`];
  if (options.maxAge === 0) parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}
