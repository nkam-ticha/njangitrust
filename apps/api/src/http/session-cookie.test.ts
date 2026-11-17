// The web refresh cookie (D1): httpOnly, Secure, scoped to /v1/auth; SameSite=Strict unless the
// deployment says the web app and the API are different sites (COOKIE_SAMESITE=none).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { resetEnvCache } from '../config/env';
import { clearRefreshCookie, deliverSession } from './session-delivery';

function responseSpy() {
  const cookies: string[] = [];
  const res = {
    append: (_name: string, value: string) => cookies.push(value),
  } as unknown as Response;
  return { res, cookies };
}

const tokens = {
  accessToken: 'a',
  accessTokenExpiresAt: new Date(),
  refreshToken: 'r'.repeat(40),
  refreshTokenExpiresAt: new Date(),
  client: 'web' as const,
};

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe('the web refresh cookie', () => {
  it('is SameSite=Strict by default, and never in the response body', () => {
    const { res, cookies } = responseSpy();
    const session = deliverSession({} as Request, res, tokens);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/HttpOnly/);
    expect(cookies[0]).toMatch(/Secure/);
    expect(cookies[0]).toMatch(/SameSite=Strict/);
    expect(cookies[0]).toMatch(/Path=\/v1\/auth/);
    expect(session).not.toHaveProperty('refreshToken');
  });

  it('is SameSite=None, still httpOnly and Secure, when the sites differ', () => {
    vi.stubEnv('COOKIE_SAMESITE', 'none');
    resetEnvCache();
    const { res, cookies } = responseSpy();
    deliverSession({} as Request, res, tokens);
    clearRefreshCookie(res);
    for (const cookie of cookies) {
      expect(cookie).toMatch(/SameSite=None/);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/Secure/);
    }
  });
});
