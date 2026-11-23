// The developer session lives in memory only (D28): nothing is written to any storage, and leaving
// or an expired token empties it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeveloperSession } from './developerSession';

const storage = () => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
});

beforeEach(() => {
  useDeveloperSession.getState().clear();
});

afterEach(() => vi.unstubAllGlobals());

describe('the developer session store', () => {
  it('starts without a token', () => {
    const state = useDeveloperSession.getState();
    expect(state.token).toBeNull();
    expect(state.expiresAt).toBeNull();
    expect(state.ended).toBe(false);
  });

  it('keeps the token and its end time, and clears them on leaving', () => {
    useDeveloperSession.getState().setSession('a.b.c', '2026-11-22T10:30:00.000Z');
    expect(useDeveloperSession.getState()).toMatchObject({
      token: 'a.b.c',
      expiresAt: Date.parse('2026-11-22T10:30:00.000Z'),
      ended: false,
    });
    useDeveloperSession.getState().clear();
    expect(useDeveloperSession.getState()).toMatchObject({
      token: null,
      expiresAt: null,
      ended: false,
    });
  });

  it('records that the session ended on its own, until the next login', () => {
    useDeveloperSession.getState().setSession('a.b.c', '2026-11-22T10:30:00.000Z');
    useDeveloperSession.getState().clear(true);
    expect(useDeveloperSession.getState().ended).toBe(true);
    useDeveloperSession.getState().setSession('d.e.f', '2026-11-22T11:00:00.000Z');
    expect(useDeveloperSession.getState().ended).toBe(false);
  });

  it('never writes the token to localStorage or sessionStorage', () => {
    const local = storage();
    const session = storage();
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', session);
    useDeveloperSession.getState().setSession('secret.token.value', '2026-11-22T10:30:00.000Z');
    useDeveloperSession.getState().clear(true);
    for (const store of [local, session]) {
      expect(store.setItem).not.toHaveBeenCalled();
      expect(store.getItem).not.toHaveBeenCalled();
    }
  });
});
