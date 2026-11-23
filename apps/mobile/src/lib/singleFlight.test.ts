// The press guard: one tap acts at once, the rest are ignored until it is over (one tap, one
// action). Tested without React: the lock is a variable, so a second tap before any re-render fails.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKeyedFlights, createSingleFlight } from './singleFlight';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createSingleFlight', () => {
  it('runs the first tap at once and ignores a second one made in the same tick', () => {
    const flight = createSingleFlight({ cooldownMs: 600 });
    const action = vi.fn();
    expect(flight.run(action)).toEqual({ started: true, result: undefined });
    expect(flight.run(action)).toEqual({ started: false });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('holds the lock until an asynchronous handler settles, however long it takes', async () => {
    const flight = createSingleFlight({ cooldownMs: 600 });
    let finish!: () => void;
    const slow = () => new Promise<void>((resolve) => (finish = resolve));
    flight.run(slow);
    expect(flight.state).toEqual({ working: true, locked: true });
    vi.advanceTimersByTime(60_000);
    expect(flight.run(slow)).toEqual({ started: false });
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(flight.state).toEqual({ working: false, locked: false });
    expect(flight.run(() => 1).started).toBe(true);
  });

  it('unlocks when an asynchronous handler fails, so the member can try again', async () => {
    const flight = createSingleFlight();
    flight.run(() => Promise.reject(new Error('offline')));
    await vi.advanceTimersByTimeAsync(0);
    expect(flight.state.locked).toBe(false);
    expect(flight.run(() => 1).started).toBe(true);
  });

  it('unlocks and re-throws when a handler throws at once', () => {
    const flight = createSingleFlight({ cooldownMs: 600 });
    expect(() =>
      flight.run(() => {
        throw new Error('bad');
      }),
    ).toThrow('bad');
    expect(flight.state.locked).toBe(false);
  });

  it('keeps a short cooldown after a handler that returned at once, then unlocks', () => {
    const flight = createSingleFlight({ cooldownMs: 600 });
    flight.run(() => undefined);
    vi.advanceTimersByTime(599);
    expect(flight.run(() => 1).started).toBe(false);
    vi.advanceTimersByTime(1);
    expect(flight.run(() => 1).started).toBe(true);
  });

  it('does not show the spinner for a handler that returned at once', () => {
    const flight = createSingleFlight({ cooldownMs: 600 });
    flight.run(() => undefined);
    expect(flight.state).toEqual({ working: false, locked: true });
  });
});

describe('createKeyedFlights', () => {
  it('lets a second caller join the request already running for the same key', async () => {
    const flights = createKeyedFlights();
    let calls = 0;
    let finish!: (value: string) => void;
    const start = () => {
      calls += 1;
      return new Promise<string>((resolve) => (finish = resolve));
    };
    const first = flights.join('confirm:a', start);
    const second = flights.join('confirm:a', start);
    expect(second).toBe(first);
    expect(flights.active('confirm:a')).toBe(true);
    finish('done');
    await expect(first).resolves.toBe('done');
    expect(calls).toBe(1);
    expect(flights.active('confirm:a')).toBe(false);
    void flights.join('confirm:a', () => Promise.resolve('again'));
    expect(flights.active('confirm:a')).toBe(true);
  });

  it('runs other keys independently and tells subscribers when a request starts and ends', async () => {
    const flights = createKeyedFlights();
    const heard = vi.fn();
    flights.subscribe(heard);
    await Promise.all([
      flights.join('a', () => Promise.resolve(1)),
      flights.join('b', () => Promise.resolve(2)),
    ]);
    expect(heard).toHaveBeenCalledTimes(4);
  });

  it('frees the key when the request fails', async () => {
    const flights = createKeyedFlights();
    await expect(flights.join('a', () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(flights.active('a')).toBe(false);
  });
});
