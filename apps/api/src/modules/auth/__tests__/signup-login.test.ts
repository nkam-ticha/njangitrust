import { afterEach, describe, expect, it } from 'vitest';
import { getPrisma } from '../../../lib/prisma';
import { advanceTestClock, resetTestClock, setTestClock } from '../../../lib/clock';
import { api } from '../../../../test/helpers/client';
import {
  ownPhonesOf,
  signUp,
  signupBody,
  TEST_PIN,
  uniquePhone,
} from '../../../../test/helpers/factories';

const signupAs = (body: Record<string, unknown>) =>
  api(null, { ownPhones: ownPhonesOf(body as { phone: string }) }).post('/v1/auth/signup', body);

describe('sign-up (spec 2.10)', () => {
  it('creates the account, its payment number (the login phone by default) and a mobile session', async () => {
    const body = signupBody();
    const res = await signupAs(body);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      phone: body.phone,
      language: 'fr',
      paymentNumber: { number: body.phone, operator: 'MTN' },
    });
    expect(res.body.user.paymentNumber.masked).toMatch(/^6•• •• •\d \d\d$/);
    expect(res.body.session.refreshToken).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(/pinHash|argon2/);
    const prefs = await getPrisma().notificationPrefs.findUnique({
      where: { userId: res.body.user.id },
    });
    expect(prefs?.mutedCategories).toEqual([]);
  });

  it('stores the PIN as an argon2id hash, never in clear', async () => {
    const user = await signUp();
    const row = await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.pinHash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
  });

  it('accepts a different payment number with its operator', async () => {
    const payment = '+237699123457';
    const res = await signupAs({
      ...signupBody(),
      paymentNumber: { number: '699 12 34 57', operator: 'ORANGE' },
    });
    expect(res.status).toBe(201);
    expect(res.body.user.paymentNumber).toMatchObject({ number: payment, operator: 'ORANGE' });
  });

  it('asks for the operator when the prefix does not tell it', async () => {
    const res = await signupAs({ ...signupBody(), paymentNumber: { number: '+237662000123' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OPERATOR_REQUIRED');
  });

  it.each(['111111', '123456', '987654'])(
    'refuses the guessable PIN %s with a clear message',
    async (pin) => {
      const res = await signupAs(signupBody({ pin }));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PIN_TOO_WEAK');
      expect(res.body.messageFr).toContain('code PIN');
      expect(res.body.messageEn).toContain('PIN');
    },
  );

  it('refuses a PIN made of the phone’s own digits', async () => {
    const phone = uniquePhone();
    const res = await signupAs(signupBody({ phone, pin: phone.slice(-6) }));
    expect(res.body.code).toBe('PIN_TOO_WEAK');
  });

  it('requires consent to the current privacy notice (Part 7)', async () => {
    expect((await signupAs(signupBody({ consent: false }))).body.code).toBe('VALIDATION_FAILED');
    expect((await signupAs(signupBody({ consentVersion: '2020-01' }))).body.code).toBe(
      'CONSENT_OUTDATED',
    );
  });

  it('refuses unknown fields and invalid phones, naming the field but never echoing the value', async () => {
    const res = await signupAs({ ...signupBody(), role: 'ADMIN' });
    expect(res.status).toBe(400);
    expect(res.body.details.issues).toContainEqual({ path: 'body', code: 'UNKNOWN_FIELD' });
    const bad = await api().post('/v1/auth/signup', { ...signupBody(), phone: '12345' });
    expect(bad.body.details.issues).toContainEqual({ path: 'body.phone', code: 'INVALID_PHONE' });
    expect(JSON.stringify(bad.body)).not.toContain('12345');
  });

  it('refuses a name that carries a phone number (names are public)', async () => {
    const res = await signupAs(signupBody({ name: 'Paul 677123456' }));
    expect(res.body.details.issues).toContainEqual({
      path: 'body.name',
      code: 'NAME_CONTAINS_PHONE',
    });
  });

  it('refuses a second account on the same phone', async () => {
    const body = signupBody();
    await signupAs(body);
    const again = await signupAs({ ...signupBody(), phone: body.phone });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('PHONE_ALREADY_REGISTERED');
  });
});

describe('login and lockout (spec 2.10)', () => {
  afterEach(() => resetTestClock());

  const loginAs = (phone: string, pin: string) =>
    api(null, { ownPhones: [phone] }).post('/v1/auth/login', { phone, pin });

  it('logs in with phone (any spelling) and PIN', async () => {
    const user = await signUp();
    const spaced = `${user.phone.slice(4, 7)} ${user.phone.slice(7, 9)} ${user.phone.slice(9, 11)} ${user.phone.slice(11)}`;
    const res = await loginAs(spaced, TEST_PIN);
    expect(res.status).toBe(200);
    const me = await api({ ...user, accessToken: res.body.session.accessToken }).get('/v1/me');
    expect(me.body.user.id).toBe(user.id);
  });

  it('locks login for 15 minutes after five wrong PINs, warning before the last try', async () => {
    const user = await signUp();
    const codes: string[] = [];
    for (let i = 0; i < 5; i += 1) codes.push((await loginAs(user.phone, '904713')).body.code);
    expect(codes).toEqual([
      'INVALID_CREDENTIALS',
      'INVALID_CREDENTIALS',
      'INVALID_CREDENTIALS',
      'INVALID_CREDENTIALS_LAST_ATTEMPT',
      'LOGIN_LOCKED',
    ]);
    const locked = await loginAs(user.phone, TEST_PIN);
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('LOGIN_LOCKED');
    expect(locked.body.details.retryAfterSeconds).toBeGreaterThan(14 * 60);
  });

  it('answers an unknown phone exactly like a wrong PIN (no enumeration)', async () => {
    const known = await signUp();
    const wrongPin = await loginAs(known.phone, '904713');
    const unknown = await loginAs(uniquePhone(), '904713');
    expect(unknown.status).toBe(wrongPin.status);
    expect(unknown.body).toEqual(wrongPin.body);
  });

  it('spends comparable time on unknown phones (argon2 runs either way)', async () => {
    const known = await signUp();
    const time = async (phone: string) => {
      const start = performance.now();
      await loginAs(phone, '904713');
      return performance.now() - start;
    };
    await time(uniquePhone()); // warm-up
    const knownMs: number[] = [];
    const unknownMs: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      knownMs.push(await time(known.phone));
      unknownMs.push(await time(uniquePhone()));
    }
    const median = (xs: number[]) => [...xs].sort((x, y) => x - y)[1]!;
    const ratio = median(unknownMs) / median(knownMs);
    expect(ratio).toBeGreaterThan(1 / 3);
    expect(ratio).toBeLessThan(3);
  });

  it('refuses tampered, foreign-algorithm and expired access tokens', async () => {
    const user = await signUp();
    const [header, payload] = user.accessToken.split('.');
    const forged = `${header}.${payload}.${'A'.repeat(43)}`;
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${payload}.`;
    for (const token of [forged, none, 'not-a-token']) {
      const res = await api({ ...user, accessToken: token }).get('/v1/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    }
    setTestClock(new Date());
    advanceTestClock(16 * 60_000);
    expect((await api(user).get('/v1/me')).status).toBe(401);
  });
});
