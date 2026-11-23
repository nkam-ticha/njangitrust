// Shared steps for the developer console's tests (D28): the developer credentials in the
// environment, a developer client, and a way to hold a transaction open while another request runs.
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect } from 'vitest';
import { resetEnvCache } from '../../src/config/env';
import { getPrisma, type Prisma } from '../../src/lib/prisma';
import { hashPin } from '../../src/modules/auth';
import {
  developerLoginByAddress,
  developerLoginInTotal,
} from '../../src/modules/developer/developer.login';
import { testApp } from './app';

export const DEV_USERNAME = 'owner-console';
export const DEV_PASSWORD = 'a long developer password 2026';

/** Puts the developer credentials in the environment for this test file, and takes them out after. */
export function useDeveloperEnv(): void {
  beforeAll(async () => {
    process.env.DEVELOPER_USERNAME = DEV_USERNAME;
    process.env.DEVELOPER_PASSWORD_HASH = await hashPin(DEV_PASSWORD);
    process.env.DEVELOPER_JWT_SECRET = 'developer-token-secret-for-tests-0123456789';
    resetEnvCache();
  });
  afterAll(() => {
    delete process.env.DEVELOPER_USERNAME;
    delete process.env.DEVELOPER_PASSWORD_HASH;
    delete process.env.DEVELOPER_JWT_SECRET;
    resetEnvCache();
  });
  beforeEach(() => {
    developerLoginByAddress.resetAllForTests();
    developerLoginInTotal.resetAllForTests();
  });
}

export async function developerToken(): Promise<string> {
  const res = await request(testApp())
    .post('/v1/developer/login')
    .send({ username: DEV_USERNAME, password: DEV_PASSWORD });
  expect(res.status).toBe(200);
  return res.body.session.token as string;
}

/** A developer request, already sent (so it can be awaited later or watched for settling). */
export function developerCall(token: string, method: 'get' | 'post' | 'delete', path: string) {
  const req = request(testApp())[method](path).set('Authorization', `Bearer ${token}`);
  return (method === 'post' ? req.send({}) : req).then((res) => res);
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A promise that tells, without being awaited, whether another one has settled yet. */
export function watch<T>(promise: Promise<T>): { settled: () => boolean; done: Promise<T> } {
  let settled = false;
  const done = promise.finally(() => {
    settled = true;
  });
  // The watcher itself never rejects: the caller awaits `done` and sees the error there.
  done.catch(() => undefined);
  return { settled: () => settled, done };
}

/**
 * A database transaction that does what a confirmation does and stays open until `release()`:
 * `work` runs first (take locks, write rows), then the transaction waits, then commits.
 * `ready` resolves once `work` is done, so the test can start the competing request.
 */
export function heldTransaction(work: (tx: Prisma.TransactionClient) => Promise<void>) {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => (release = resolve));
  let markReady!: () => void;
  const ready = new Promise<void>((resolve) => (markReady = resolve));
  const finished = getPrisma().$transaction(
    async (tx) => {
      await work(tx);
      markReady();
      await hold;
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
  // If `work` fails, the test must not wait for `ready` for ever: it sees the error in `finished`.
  finished.catch(() => markReady());
  return { ready, release, finished };
}
