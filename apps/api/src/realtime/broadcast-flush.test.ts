// Serverless hosting: a broadcast is an HTTP call that must finish before the response ends, or the
// frozen function drops it. The local Socket.IO path starts no such call and is not delayed.
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { settleBeforeResponse } from '../http/settle';
import { hasPendingWork, settlePendingWork, trackPendingWork } from '../lib/pending-work';
import { attachSupabaseRealtimePublisher, emitToUser } from './emitter';

const USER = '00000000-0000-4000-8000-000000000001';

function appThatEmits() {
  const app = express();
  app.use(settleBeforeResponse());
  app.get('/emit', (_req, res) => {
    emitToUser(USER, 'session.ended', { reason: 'LOGGED_OUT' });
    res.json({ ok: true });
  });
  return app;
}

afterEach(async () => {
  attachSupabaseRealtimePublisher(null);
  vi.unstubAllGlobals();
  await settlePendingWork();
});

describe('realtime broadcasts and the end of a response', () => {
  it('ends the response only after the broadcast it started has been delivered', async () => {
    const order: string[] = [];
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
      calls.push({ url, body: init.body });
      await new Promise((resolve) => setTimeout(resolve, 150));
      order.push('broadcast delivered');
      return new Response('{}', { status: 202 });
    });
    attachSupabaseRealtimePublisher({ url: 'https://example.supabase.co', serviceRoleKey: 'test' });
    const res = await request(appThatEmits()).get('/emit');
    order.push('response received');
    expect(res.status).toBe(200);
    expect(order).toEqual(['broadcast delivered', 'response received']);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://example.supabase.co/realtime/v1/api/broadcast');
    expect(JSON.parse(calls[0]!.body).messages[0]).toMatchObject({
      topic: `user:${USER}`,
      event: 'session.ended',
      private: true,
    });
    expect(hasPendingWork()).toBe(false);
  });

  it('still answers when the broadcast fails', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('network down')));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    attachSupabaseRealtimePublisher({ url: 'https://example.supabase.co', serviceRoleKey: 'test' });
    expect((await request(appThatEmits()).get('/emit')).status).toBe(200);
    vi.restoreAllMocks();
  });

  it('holds nothing back without the publisher (local Socket.IO server)', async () => {
    const fetched = vi.fn();
    vi.stubGlobal('fetch', fetched);
    const res = await request(appThatEmits()).get('/emit');
    expect(res.status).toBe(200);
    expect(fetched).not.toHaveBeenCalled();
    expect(hasPendingWork()).toBe(false);
  });

  it('waits for work that tracked work starts in turn, and never rejects', async () => {
    const done: string[] = [];
    trackPendingWork(
      new Promise<void>((resolve) => setTimeout(resolve, 20)).then(() => {
        trackPendingWork(
          new Promise<void>((resolve) => setTimeout(resolve, 20)).then(() => {
            done.push('second');
          }),
        );
        done.push('first');
      }),
    );
    trackPendingWork(Promise.reject(new Error('failed work')));
    await settlePendingWork();
    expect(done).toEqual(['first', 'second']);
  });
});
