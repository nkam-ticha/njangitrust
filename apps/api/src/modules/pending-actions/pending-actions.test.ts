// The confirmation protocol (spec 4.5, 5.3): confirming twice executes once; a changed situation
// is re-checked; expired, cancelled or foreign actions never execute; L2 needs the PIN.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defineErrors } from '../../lib/errors';
import { advanceTestClock, resetTestClock, setTestClock } from '../../lib/clock';
import { recordRealtimeEvents } from '../../realtime/emitter';
import { api, type TestUser } from '../../../test/helpers/client';
import { confirm, signUp } from '../../../test/helpers/factories';
import { testApp } from '../../../test/helpers/app';
import * as publicSurface from './index';
import {
  createPendingAction,
  defineActionHandler,
  expireDuePendingActions,
  registerActionHandler,
} from './index';

const state = { amount: 11_000, refuse: false, crash: false, executions: 0 };
const testError = defineErrors({
  TEST_REFUSED: { status: 422, text: { fr: 'Refusé.', en: 'Refused.' } },
});

function handler(type: string, level: 'L1' | 'L2') {
  return defineActionHandler({
    type,
    level,
    args: z.strictObject({ note: z.string() }),
    prepare() {
      if (state.refuse) return Promise.reject(testError('TEST_REFUSED'));
      return Promise.resolve({
        title: { fr: 'Payer ta cotisation', en: 'Pay your contribution' },
        lines: [{ label: { fr: 'Cotisation', en: 'Contribution' }, amount: state.amount }],
        total: state.amount,
        notes: [],
        confirmLabel: { fr: 'Payer', en: 'Pay' },
      });
    },
    execute() {
      if (state.crash) return Promise.reject(new Error('boom'));
      state.executions += 1;
      return Promise.resolve({
        outcome: 'done' as const,
        resultRef: `ref-${state.executions}`,
        summary: { fr: 'Payé', en: 'Paid' },
        data: { n: state.executions },
      });
    },
  });
}

async function newAction(user: TestUser, type = 'TEST_PAY') {
  return createPendingAction({
    userId: user.id,
    groupId: null,
    lang: 'fr',
    origin: 'AGENT',
    type,
    args: { note: 'x' },
  });
}

describe('pending actions (spec 4.5)', () => {
  let owner: TestUser;
  let stranger: TestUser;

  beforeAll(async () => {
    testApp();
    registerActionHandler(handler('TEST_PAY', 'L1'));
    registerActionHandler(handler('TEST_SECURE', 'L2'));
    owner = await signUp();
    stranger = await signUp();
  });

  afterEach(() => {
    Object.assign(state, { amount: 11_000, refuse: false, crash: false, executions: 0 });
    resetTestClock();
  });

  it('stores a server-built card that expires after 10 minutes', async () => {
    setTestClock(new Date());
    const action = await newAction(owner);
    const res = await api(owner).get(`/v1/pending-actions/${action.id}`);
    expect(res.body.action).toMatchObject({
      status: 'PENDING',
      origin: 'AGENT',
      level: 'L1',
      requiresPin: false,
    });
    expect(res.body.action.preview.total).toBe(11_000);
    expect(
      new Date(res.body.action.expiresAt).getTime() - action.createdAt.getTime(),
    ).toBeLessThanOrEqual(10 * 60_000 + 1_000);
    expect(res.body.action).not.toHaveProperty('args');
  });

  it('executes once when confirmed twice, even at the same moment', async () => {
    const action = await newAction(owner);
    const [a, b] = await Promise.all([confirm(owner, action.id), confirm(owner, action.id)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect([a.body.code, b.body.code]).toContain('ACTION_ALREADY_CONFIRMED');
    const later = await confirm(owner, action.id);
    expect(later.status).toBe(409);
    expect(state.executions).toBe(1);
    expect((await api(owner).get(`/v1/pending-actions/${action.id}`)).body.action).toMatchObject({
      status: 'DONE',
      result: { ref: 'ref-1', summary: { fr: 'Payé', en: 'Paid' } },
    });
  });

  it('re-checks on confirm: a changed amount fails and nothing executes', async () => {
    const action = await newAction(owner);
    state.amount = 12_000;
    const res = await confirm(owner, action.id);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ACTION_CHANGED');
    expect(state.executions).toBe(0);
    const card = (await api(owner).get(`/v1/pending-actions/${action.id}`)).body.action;
    expect(card.status).toBe('FAILED');
    expect(card.failure).toMatchObject({ code: 'ACTION_CHANGED', key: 'situationChanged' });
  });

  it('re-checks on confirm: a refusal from the services fails the action', async () => {
    const action = await newAction(owner);
    state.refuse = true;
    const res = await confirm(owner, action.id);
    expect(res.body.code).toBe('TEST_REFUSED');
    expect(state.executions).toBe(0);
  });

  it('fails cleanly when execution crashes, without leaking details', async () => {
    const action = await newAction(owner);
    state.crash = true;
    const res = await confirm(owner, action.id);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      code: 'INTERNAL',
      messageFr: expect.any(String),
      messageEn: expect.any(String),
    });
    expect(res.text).not.toContain('boom');
    expect((await api(owner).get(`/v1/pending-actions/${action.id}`)).body.action.status).toBe(
      'FAILED',
    );
  });

  it('refuses to confirm after expiry, and the job expires overdue actions', async () => {
    setTestClock(new Date());
    const action = await newAction(owner);
    const other = await newAction(owner);
    advanceTestClock(10 * 60_000 + 1_000);
    const res = await confirm(owner, action.id);
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('ACTION_EXPIRED');
    expect(await expireDuePendingActions()).toBeGreaterThanOrEqual(1);
    expect((await api(owner).get(`/v1/pending-actions/${other.id}`)).body.action.status).toBe(
      'EXPIRED',
    );
    expect(state.executions).toBe(0);
  });

  it('is invisible to anyone but its owner, who alone can confirm or cancel it', async () => {
    const action = await newAction(owner);
    for (const res of [
      await api(stranger).get(`/v1/pending-actions/${action.id}`),
      await confirm(stranger, action.id),
      await api(stranger).post(`/v1/pending-actions/${action.id}/cancel`),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    }
    expect((await api().post(`/v1/pending-actions/${action.id}/confirm`, {})).status).toBe(401);
    expect(state.executions).toBe(0);
  });

  it('cancels, and a cancelled action can no longer be confirmed', async () => {
    const action = await newAction(owner);
    expect(
      (await api(owner).post(`/v1/pending-actions/${action.id}/cancel`)).body.action.status,
    ).toBe('CANCELLED');
    expect((await confirm(owner, action.id)).body.code).toBe('ACTION_CANCELLED');
    expect(state.executions).toBe(0);
  });

  it('asks for the PIN on L2 actions and locks after five wrong ones', async () => {
    const user = await signUp();
    const action = await newAction(user, 'TEST_SECURE');
    expect((await api(user).get(`/v1/pending-actions/${action.id}`)).body.action.requiresPin).toBe(
      true,
    );
    expect((await confirm(user, action.id)).body.code).toBe('PIN_REQUIRED');
    const codes: string[] = [];
    for (let i = 0; i < 5; i += 1) codes.push((await confirm(user, action.id, '904713')).body.code);
    expect(codes.slice(0, 3)).toEqual(['PIN_INCORRECT', 'PIN_INCORRECT', 'PIN_INCORRECT']);
    expect(codes[3]).toBe('PIN_INCORRECT_LAST_ATTEMPT');
    expect(codes[4]).toBe('PIN_LOCKED');
    expect((await confirm(user, action.id, user.pin)).body.code).toBe('PIN_LOCKED');
    expect(state.executions).toBe(0);

    const fresh = await signUp();
    const ok = await newAction(fresh, 'TEST_SECURE');
    expect((await confirm(fresh, ok.id, fresh.pin)).status).toBe(200);
    expect(state.executions).toBe(1);
  });

  it('announces every state change on the owner’s room only', async () => {
    const events = recordRealtimeEvents();
    const action = await newAction(owner);
    await confirm(owner, action.id);
    const mine = events.filter((e) => e.event === 'pendingAction.updated');
    expect(mine.map((e) => e.room)).toEqual([`user:${owner.id}`, `user:${owner.id}`]);
    expect(mine.map((e) => (e.payload as { status: string }).status)).toEqual(['PENDING', 'DONE']);
  });
});

describe('the LLM has no path to confirm (CLAUDE.md rule 5)', () => {
  it('does not export the confirm function from the module’s public surface', () => {
    expect(Object.keys(publicSurface)).not.toContain('confirmPendingAction');
  });

  it('imports the confirm file only from the HTTP route', () => {
    const src = path.resolve(__dirname, '../..');
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (
          /\.ts$/.test(name) &&
          !name.endsWith('.test.ts') &&
          /from\s+['"][^'"]*pending-actions\.confirm['"]/.test(readFileSync(full, 'utf8'))
        ) {
          importers.push(path.relative(src, full).replace(/\\/g, '/'));
        }
      }
    };
    walk(src);
    expect(importers).toEqual(['modules/pending-actions/pending-actions.routes.ts']);
  });
});
