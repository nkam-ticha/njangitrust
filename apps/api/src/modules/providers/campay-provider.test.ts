// CamPay behind the PaymentProvider interface (spec 2.6), against a simulated CamPay server:
// the exact requests it must send, what it reports back, and how it handles refusals.
import express from 'express';
import { SignJWT } from 'jose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../http/error-handler';
import { CampayError, CampayProvider } from './campay-provider';
import { campayWebhookRoutes, isCampaySignature } from './campay-webhook';

const BASE = 'https://demo.campay.net';
const PHONE = '+237677123456';

interface Call {
  method: string;
  path: string;
  auth: string | null;
  body: Record<string, unknown> | null;
}

/** A CamPay double: answers each path from `routes`, and records what it was sent. */
function fakeCampay(routes: Record<string, (call: Call) => { status: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetchFn = ((
    input: string,
    init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  ) => {
    const url = new URL(input);
    const headers = new Headers(init.headers);
    const call: Call = {
      method: init.method ?? 'GET',
      path: url.pathname,
      auth: headers.get('authorization'),
      body: init.body ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    };
    calls.push(call);
    const route = routes[`${call.method} ${call.path}`];
    const answer = route ? route(call) : { status: 404, body: { message: 'not found' } };
    return Promise.resolve(
      new Response(JSON.stringify(answer.body), {
        status: answer.status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }) as typeof fetch;
  return { calls, fetchFn };
}

const withToken = (fetchFn: typeof fetch) =>
  new CampayProvider({ baseUrl: BASE, accessToken: 'permanent-token', fetch: fetchFn });

describe('collecting a payment', () => {
  it('sends the whole-franc amount, XAF, the number without "+" and our id as external reference', async () => {
    const { calls, fetchFn } = fakeCampay({
      'POST /api/collect/': () => ({
        status: 200,
        body: {
          reference: 'bcedde9b-62a7-4421-96ac-2e6179552a1a',
          ussd_code: '*126#',
          operator: 'mtn',
        },
      }),
    });
    const started = await withToken(fetchFn).requestPayment({
      amount: 10_100,
      phone: PHONE,
      externalRef: '7f1e6a2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
      description: 'NjangiTrust payment',
    });
    expect(started).toEqual({
      providerRef: 'bcedde9b-62a7-4421-96ac-2e6179552a1a',
      status: 'PENDING',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', auth: 'Token permanent-token' });
    expect(calls[0]!.body).toEqual({
      amount: '10100',
      currency: 'XAF',
      from: '237677123456',
      description: 'NjangiTrust payment',
      external_reference: '7f1e6a2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
    });
  });

  it('refuses a fractional or non-positive amount and a number that is not Cameroonian, before any call', async () => {
    const { calls, fetchFn } = fakeCampay({});
    const provider = withToken(fetchFn);
    const input = { phone: PHONE, externalRef: 'x', description: 'd' };
    await expect(provider.requestPayment({ ...input, amount: 10.5 })).rejects.toMatchObject({
      code: 'INVALID_AMOUNT',
    });
    await expect(provider.requestPayment({ ...input, amount: 0 })).rejects.toMatchObject({
      code: 'INVALID_AMOUNT',
    });
    await expect(
      provider.requestPayment({ ...input, amount: 100, phone: '+33612345678' }),
    ).rejects.toMatchObject({ code: 'INVALID_PHONE' });
    expect(calls).toHaveLength(0);
  });

  it('reports CamPay’s own error code and never the response body', async () => {
    const { fetchFn } = fakeCampay({
      'POST /api/collect/': () => ({
        status: 400,
        body: { message: 'Invalid number 237677123456', error_code: 'ER102' },
      }),
    });
    const error = await withToken(fetchFn)
      .requestPayment({ amount: 100, phone: PHONE, externalRef: 'x', description: 'd' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CampayError);
    expect((error as CampayError).code).toBe('ER102');
    expect(String((error as Error).message)).not.toContain('677');
  });
});

describe('status of a payment or a send', () => {
  const REF = 'bcedde9b-62a7-4421-96ac-2e6179552a1a';
  const answer = (status: string) => ({
    'GET /api/transaction/bcedde9b-62a7-4421-96ac-2e6179552a1a/': () => ({
      status: 200,
      body: {
        reference: REF,
        status,
        amount: 100,
        operator: 'MTN',
        operator_reference: '1880106956',
      },
    }),
  });

  it('is SUCCESSFUL only when CamPay says so; anything unknown stays PENDING', async () => {
    for (const [said, expected] of [
      ['SUCCESSFUL', 'SUCCESSFUL'],
      ['FAILED', 'FAILED'],
      ['PENDING', 'PENDING'],
      ['SOMETHING_NEW', 'PENDING'],
    ] as const) {
      const provider = withToken(fakeCampay(answer(said)).fetchFn);
      expect((await provider.getPaymentStatus(REF)).status).toBe(expected);
      expect((await provider.getDisbursementStatus(REF)).status).toBe(expected);
    }
  });

  it('gives the operator and its reference, and no fee (the fee schedule applies)', async () => {
    const status = await withToken(fakeCampay(answer('SUCCESSFUL')).fetchFn).getPaymentStatus(REF);
    expect(status).toEqual({ status: 'SUCCESSFUL', operator: 'MTN', operatorRef: '1880106956' });
  });

  it('refuses a reference that could change the request path', async () => {
    const { calls, fetchFn } = fakeCampay({});
    await expect(withToken(fetchFn).getPaymentStatus('../balance')).rejects.toMatchObject({
      code: 'INVALID_REFERENCE',
    });
    expect(calls).toHaveLength(0);
  });
});

describe('sending money and reading the balance', () => {
  it('sends a withdrawal to the member’s number with our id as external reference', async () => {
    const { calls, fetchFn } = fakeCampay({
      'POST /api/withdraw/': () => ({
        status: 200,
        body: { reference: 'aaaaaaaa-1111-2222-3333-444444444444' },
      }),
    });
    const sent = await withToken(fetchFn).disburse({
      amount: 29_500,
      phone: PHONE,
      externalRef: 'd1',
      description: 'NjangiTrust withdrawal',
    });
    expect(sent.providerRef).toBe('aaaaaaaa-1111-2222-3333-444444444444');
    expect(calls[0]!.body).toMatchObject({ amount: '29500', currency: 'XAF', to: '237677123456' });
  });

  it('reports an insufficient operator balance as a refusal (ER301)', async () => {
    const { fetchFn } = fakeCampay({
      'POST /api/withdraw/': () => ({ status: 400, body: { error_code: 'ER301' } }),
    });
    await expect(
      withToken(fetchFn).disburse({
        amount: 100,
        phone: PHONE,
        externalRef: 'd',
        description: 'd',
      }),
    ).rejects.toMatchObject({ code: 'ER301' });
  });

  it('reads the balance in whole francs', async () => {
    const { fetchFn } = fakeCampay({
      'GET /api/balance/': () => ({
        status: 200,
        body: {
          total_balance: 12_345.75,
          mtn_balance: '10000.50',
          orange_balance: 2345.25,
          currency: 'XAF',
        },
      }),
    });
    expect(await withToken(fetchFn).getBalance()).toEqual({
      total: 12_345,
      mtn: 10_000,
      orange: 2_345,
    });
  });
});

describe('authentication', () => {
  it('asks for a token with the username and password, reuses it, and renews it after a 401', async () => {
    let issued = 0;
    let rejectFirst = true;
    const { calls, fetchFn } = fakeCampay({
      'POST /api/token/': () => {
        issued += 1;
        return { status: 200, body: { token: `short-${issued}`, expires_in: 3_600 } };
      },
      'GET /api/balance/': (call) => {
        if (call.auth === 'Token short-1' && rejectFirst && issued === 1 && calls.length > 4) {
          rejectFirst = false;
          return { status: 401, body: { detail: 'Invalid token' } };
        }
        return { status: 200, body: { total_balance: 1 } };
      },
    });
    const provider = new CampayProvider({
      baseUrl: BASE,
      username: 'u',
      password: 'p',
      fetch: fetchFn,
    });
    await provider.getBalance();
    await provider.getBalance();
    expect(issued).toBe(1);
    expect(calls[0]!.body).toEqual({ username: 'u', password: 'p' });
    // The third balance call is refused once: a new token is asked for and the call repeated.
    await provider.getBalance();
    await provider.getBalance();
    expect(issued).toBe(2);
    expect(calls.at(-1)!.auth).toBe('Token short-2');
  });

  it('fails with UNAUTHORIZED when CamPay refuses the credentials', async () => {
    const { fetchFn } = fakeCampay({
      'POST /api/token/': () => ({
        status: 400,
        body: { non_field_errors: ['Unable to log in with provided credentials.'] },
      }),
    });
    const provider = new CampayProvider({
      baseUrl: BASE,
      username: 'u',
      password: 'p',
      fetch: fetchFn,
    });
    await expect(provider.getBalance()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const refused = fakeCampay({
      'GET /api/balance/': () => ({ status: 401, body: { detail: 'Invalid token' } }),
    });
    await expect(withToken(refused.fetchFn).getBalance()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('needs HTTPS and some credentials', () => {
    expect(
      () => new CampayProvider({ baseUrl: 'http://demo.campay.net', accessToken: 't' }),
    ).toThrow();
    expect(() => new CampayProvider({ baseUrl: BASE })).toThrow();
  });
});

describe('the callback (spec 2.6.4)', () => {
  const KEY = 'test-webhook-key-test-webhook-key-123456';
  const sign = (key: string) =>
    new SignJWT({ reference: 'bcedde9b-62a7-4421-96ac-2e6179552a1a' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode(key));
  const app = express();
  app.use(express.json());
  app.use(
    '/hook',
    campayWebhookRoutes(() => KEY),
  );
  app.use(errorHandler());

  it('accepts only a signature made with the webhook key', async () => {
    expect(await isCampaySignature(await sign(KEY), KEY)).toBe(true);
    expect(await isCampaySignature(await sign('another-key-another-key-another-key-00'), KEY)).toBe(
      false,
    );
    expect(await isCampaySignature('not-a-jwt', KEY)).toBe(false);
  });

  it('refuses an unsigned or forged callback and accepts a signed one, by GET and POST', async () => {
    const query = { status: 'SUCCESSFUL', reference: 'bcedde9b-62a7-4421-96ac-2e6179552a1a' };
    expect((await request(app).get('/hook').query(query)).status).toBe(401);
    const forged = await sign('another-key-another-key-another-key-00');
    expect(
      (
        await request(app)
          .get('/hook')
          .query({ ...query, signature: forged })
      ).status,
    ).toBe(401);
    const signature = await sign(KEY);
    const byGet = await request(app)
      .get('/hook')
      .query({ ...query, signature });
    expect(byGet.status).toBe(200);
    expect(byGet.body).toEqual({ received: true });
    const byPost = await request(app)
      .post('/hook')
      .send({ ...query, signature });
    expect(byPost.status).toBe(200);
  });
});
