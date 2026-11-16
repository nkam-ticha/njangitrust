// Like `api()` (client.ts), but against the app that also mounts the new routers (stage-app.ts).
// Every response is scanned for phone numbers that are not the requester's own (spec 5.3).
import request, { type Response } from 'supertest';
import { normalizeCameroonPhone } from '@njangi/shared';
import { CLIENT_HEADER } from '@njangi/shared/contracts/common';
import type { TestUser } from './client';
import { assertNoForeignPhones } from './phone-scanner';
import { stageApp } from './stage-app';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

export function stageApi(as: TestUser | null = null, options: { web?: boolean } = {}) {
  const send = async (method: Method, path: string, body?: unknown): Promise<Response> => {
    let req = request(stageApp())[method](path);
    if (as) req = req.set('Authorization', `Bearer ${as.accessToken}`);
    if (options.web) req = req.set(CLIENT_HEADER, 'web');
    const res = body === undefined ? await req : await req.send(body as object);
    const allowed = (as ? [as.phone, as.paymentNumber] : []).map(
      (p) => normalizeCameroonPhone(p) ?? p,
    );
    assertNoForeignPhones(res.body, allowed, `${method.toUpperCase()} ${path} body`);
    assertNoForeignPhones(res.text ?? '', allowed, `${method.toUpperCase()} ${path} text`);
    return res;
  };
  return {
    get: (path: string) => send('get', path),
    post: (path: string, body?: unknown) => send('post', path, body),
    put: (path: string, body?: unknown) => send('put', path, body),
    patch: (path: string, body?: unknown) => send('patch', path, body),
    delete: (path: string) => send('delete', path),
  };
}

export type StageClient = ReturnType<typeof stageApi>;

/** Confirms a card as `user` through the real endpoint, then waits for the jobs it started. */
export async function confirmCard(user: TestUser, actionId: string, pin?: string) {
  const { settleBackground } = await import('../../src/jobs/dispatch');
  const res = await stageApi(user).post(
    `/v1/pending-actions/${actionId}/confirm`,
    pin ? { pin } : {},
  );
  await settleBackground();
  return res;
}
