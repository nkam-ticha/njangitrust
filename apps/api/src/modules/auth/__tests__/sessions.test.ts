import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { CLIENT_HEADER } from '@njangi/shared/contracts/common';
import { getPrisma } from '../../../lib/prisma';
import { testApp } from '../../../../test/helpers/app';
import { api } from '../../../../test/helpers/client';
import { ownPhonesOf, signUp, signupBody } from '../../../../test/helpers/factories';
import { TEST_ORIGIN } from '../../../../test/env';

const refreshWith = (refreshToken: string) => api().post('/v1/auth/refresh', { refreshToken });

describe('refresh tokens (spec 2.10, D7)', () => {
  it('rotates on every use: the new pair works, and the old refresh token is spent', async () => {
    const user = await signUp();
    const first = await refreshWith(user.refreshToken);
    expect(first.status).toBe(200);
    expect(first.body.session.refreshToken).not.toBe(user.refreshToken);
    const me = await api({ ...user, accessToken: first.body.session.accessToken }).get('/v1/me');
    expect(me.status).toBe(200);
    const second = await refreshWith(first.body.session.refreshToken);
    expect(second.status).toBe(200);
  });

  it('stores refresh tokens only as a keyed hash', async () => {
    const user = await signUp();
    const rows = await getPrisma().refreshToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]!.tokenHash).not.toContain(user.refreshToken);
  });

  it('detects reuse: revokes the whole family, warns the member and audits it', async () => {
    const user = await signUp();
    const rotated = await refreshWith(user.refreshToken);
    const reuse = await refreshWith(user.refreshToken);
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('SESSION_REUSED');
    // The thief's and the owner's latest tokens are both dead now.
    expect((await refreshWith(rotated.body.session.refreshToken)).status).toBe(401);
    expect(
      (await api({ ...user, accessToken: rotated.body.session.accessToken }).get('/v1/me')).status,
    ).toBe(401);
    const notice = await getPrisma().notification.findFirst({
      where: { userId: user.id, category: 'SECURITY' },
    });
    expect(notice?.titleFr).toBe('Session fermée par sécurité');
    const audit = await getPrisma().auditLog.findFirst({
      where: { actorUserId: user.id, action: 'auth.refresh.reuse_detected' },
    });
    expect(audit).not.toBeNull();
  });

  it('refuses unknown and malformed refresh tokens', async () => {
    expect((await refreshWith('x'.repeat(43))).body.code).toBe('SESSION_INVALID');
    expect((await refreshWith('short')).body.code).toBe('VALIDATION_FAILED');
  });
});

describe('logout (spec 2.10)', () => {
  it('ends this device’s session at once, access token included', async () => {
    const user = await signUp();
    expect(
      (await api(user).post('/v1/auth/logout', { refreshToken: user.refreshToken })).status,
    ).toBe(204);
    expect((await api(user).get('/v1/me')).status).toBe(401);
    expect((await refreshWith(user.refreshToken)).status).toBe(401);
  });

  it('log out everywhere revokes every session and every access token', async () => {
    const user = await signUp();
    const other = await api(null, { ownPhones: [user.phone] }).post('/v1/auth/login', {
      phone: user.phone,
      pin: user.pin,
    });
    expect((await api(user).post('/v1/auth/logout-all')).status).toBe(204);
    expect((await api(user).get('/v1/me')).status).toBe(401);
    expect(
      (await api({ ...user, accessToken: other.body.session.accessToken }).get('/v1/me')).status,
    ).toBe(401);
    expect((await refreshWith(other.body.session.refreshToken)).status).toBe(401);
  });
});

describe('push devices follow their login (privacy-guard L9)', () => {
  const token = () =>
    `ExponentPushToken[` +
    Math.floor(Math.random() * 1e12)
      .toString(36)
      .padEnd(12, 'x') +
    ']';

  it('stops pushing to a device whose login ended, and never returns the push token', async () => {
    const user = await signUp();
    const pushToken = token();
    const registered = await api(user).post('/v1/me/devices', {
      platform: 'ANDROID',
      expoPushToken: pushToken,
    });
    expect(registered.status).toBe(201);
    expect(registered.body.device.pushEnabled).toBe(true);
    expect(JSON.stringify(registered.body)).not.toContain(pushToken);
    await api(user).post('/v1/auth/logout', { refreshToken: user.refreshToken });
    const device = await getPrisma().device.findUniqueOrThrow({
      where: { id: registered.body.device.id },
    });
    expect(device.expoPushToken).toBeNull();
    expect(device.revokedAt).not.toBeNull();
  });

  it('revokes every device on log out everywhere', async () => {
    const user = await signUp();
    await api(user).post('/v1/me/devices', { platform: 'ANDROID', expoPushToken: token() });
    await api(user).post('/v1/auth/logout-all');
    expect(await getPrisma().device.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  });
});

describe('web clients (D1): refresh cookie and CSRF header', () => {
  async function webSignup() {
    const body = signupBody();
    const res = await api(null, {
      web: true,
      ownPhones: ownPhonesOf(body),
      headers: { Origin: TEST_ORIGIN },
    }).post('/v1/auth/signup', body);
    const cookie = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('njangi_rt='));
    return { res, cookie: cookie!, pair: cookie!.split(';')[0]! };
  }

  it('sets an httpOnly, Secure, SameSite=Strict cookie on /v1/auth and keeps the token out of the body', async () => {
    const { res, cookie } = await webSignup();
    expect(res.status).toBe(201);
    expect(res.body.session.refreshToken).toBeUndefined();
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/v1\/auth/);
    expect(res.headers['access-control-allow-origin']).toBe(TEST_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('refreshes from the cookie only with the X-Njangi-Client header and an allowed origin', async () => {
    const { pair } = await webSignup();
    const noHeader = await request(testApp()).post('/v1/auth/refresh').set('Cookie', pair).send({});
    expect(noHeader.status).toBe(403);
    expect(noHeader.body.code).toBe('CSRF_HEADER_MISSING');

    const foreign = await request(testApp())
      .post('/v1/auth/refresh')
      .set('Cookie', pair)
      .set(CLIENT_HEADER, 'web')
      .set('Origin', 'https://evil.example')
      .send({});
    expect(foreign.status).toBe(403);
    expect(foreign.body.code).toBe('ORIGIN_NOT_ALLOWED');

    const ok = await request(testApp())
      .post('/v1/auth/refresh')
      .set('Cookie', pair)
      .set(CLIENT_HEADER, 'web')
      .set('Origin', TEST_ORIGIN)
      .send({});
    expect(ok.status).toBe(200);
    expect(ok.body.session.refreshToken).toBeUndefined();
    expect(String(ok.headers['set-cookie'])).toMatch(/njangi_rt=/);
  });

  it('answers CORS preflights only for configured origins', async () => {
    const allowed = await request(testApp())
      .options('/v1/auth/refresh')
      .set('Origin', TEST_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');
    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-headers']).toContain(CLIENT_HEADER);
    const refused = await request(testApp())
      .options('/v1/auth/refresh')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(refused.status).toBe(403);
    expect(refused.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('logout clears the cookie', async () => {
    const { pair } = await webSignup();
    const res = await request(testApp())
      .post('/v1/auth/logout')
      .set('Cookie', pair)
      .set(CLIENT_HEADER, 'web')
      .set('Origin', TEST_ORIGIN)
      .send({});
    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'])).toMatch(/njangi_rt=; Path=\/v1\/auth; Max-Age=0/);
  });
});
