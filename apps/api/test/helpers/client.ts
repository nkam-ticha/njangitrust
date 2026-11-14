// A Supertest client acting as one user (or nobody). Every response it receives is scanned for
// phone numbers that are not that user's own (spec 5.3).
import request, { type Response } from 'supertest';
import { normalizeCameroonPhone } from '@njangi/shared';
import { CLIENT_HEADER } from '@njangi/shared/contracts/common';
import { testApp } from './app';
import { assertNoForeignPhones } from './phone-scanner';

export interface TestUser {
  id: string;
  name: string;
  phone: string;
  paymentNumber: string;
  pin: string;
  accessToken: string;
  refreshToken: string;
}

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

export interface ClientOptions {
  /** Send X-Njangi-Client: web (D1). */
  web?: boolean;
  headers?: Record<string, string>;
  /** The requester's own numbers when not logged in yet (sign-up, login, accepting an invite). */
  ownPhones?: readonly string[];
}

function scan(res: Response, allowed: readonly string[], where: string): Response {
  assertNoForeignPhones(res.body, allowed, `${where} body`);
  assertNoForeignPhones(res.text ?? '', allowed, `${where} text`);
  return res;
}

export function api(as: TestUser | null = null, options: ClientOptions = {}) {
  const send = async (method: Method, path: string, body?: unknown): Promise<Response> => {
    let req = request(testApp())[method](path);
    if (as) req = req.set('Authorization', `Bearer ${as.accessToken}`);
    if (options.web) req = req.set(CLIENT_HEADER, 'web');
    for (const [name, value] of Object.entries(options.headers ?? {})) req = req.set(name, value);
    const res = body === undefined ? await req : await req.send(body as object);
    const allowed = [...(as ? [as.phone, as.paymentNumber] : []), ...(options.ownPhones ?? [])].map(
      (p) => normalizeCameroonPhone(p) ?? p,
    );
    return scan(res, allowed, `${method.toUpperCase()} ${path}`);
  };
  return {
    get: (path: string) => send('get', path),
    post: (path: string, body?: unknown) => send('post', path, body),
    patch: (path: string, body?: unknown) => send('patch', path, body),
    put: (path: string, body?: unknown) => send('put', path, body),
    delete: (path: string) => send('delete', path),
  };
}
