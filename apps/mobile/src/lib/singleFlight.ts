// Single-flight press guard: the first tap acts at once, every other tap is ignored until the
// first one is over. The lock is a plain variable, not React state, so a second tap that arrives
// before the screen has re-rendered (a double tap, a held Enter key) is refused too. Pure and
// framework-free: `useSingleFlight` (useSingleFlight.ts) wires it to a component.

export interface FlightState {
  /** An asynchronous handler is still running: show a spinner. */
  working: boolean;
  /** Taps are being ignored (working, or inside the short cooldown after a synchronous handler). */
  locked: boolean;
}

export type FlightResult<T> = { started: false } | { started: true; result: T };

export interface SingleFlightOptions {
  /**
   * How long taps stay ignored after a handler that returned at once (it started a request with
   * `mutate`, or navigated). Handlers that return a promise hold the lock until it settles.
   */
  cooldownMs?: number;
  onChange?: (state: FlightState) => void;
}

export interface SingleFlight {
  readonly state: FlightState;
  /** Runs `fn` unless a tap is already in flight. A thrown error unlocks and is re-thrown. */
  run<T>(fn: () => T): FlightResult<T>;
  dispose(): void;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

export function createSingleFlight(options: SingleFlightOptions = {}): SingleFlight {
  const { cooldownMs = 0, onChange } = options;
  let state: FlightState = { working: false, locked: false };
  let timer: ReturnType<typeof setTimeout> | null = null;

  const set = (next: FlightState) => {
    if (next.working === state.working && next.locked === state.locked) return;
    state = next;
    onChange?.(state);
  };
  const unlock = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    set({ working: false, locked: false });
  };

  return {
    get state() {
      return state;
    },
    run<T>(fn: () => T): FlightResult<T> {
      if (state.locked) return { started: false };
      // Locked before `fn` runs: even a handler that re-enters sees the lock.
      state = { working: false, locked: true };
      let result: T;
      try {
        result = fn();
      } catch (error) {
        unlock();
        throw error;
      }
      if (isThenable(result)) {
        set({ working: true, locked: true });
        result.then(unlock, unlock);
      } else if (cooldownMs > 0) {
        onChange?.(state);
        timer = setTimeout(unlock, cooldownMs);
      } else {
        unlock();
      }
      return { started: true, result };
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

/**
 * One request per key at a time, shared by every component that shows the same thing (the same
 * card in the conversation and in a sheet): a second caller joins the request already running
 * instead of sending another. Subscribers hear every start and end (useSyncExternalStore).
 */
export interface KeyedFlights {
  join<T>(key: string, start: () => Promise<T>): Promise<T>;
  active(key: string): boolean;
  subscribe(listener: () => void): () => void;
}

export function createKeyedFlights(): KeyedFlights {
  const running = new Map<string, Promise<unknown>>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  return {
    join<T>(key: string, start: () => Promise<T>): Promise<T> {
      const existing = running.get(key) as Promise<T> | undefined;
      if (existing) return existing;
      let started: Promise<T>;
      try {
        started = start();
      } catch (error) {
        started = Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
      const tracked = started.finally(() => {
        running.delete(key);
        notify();
      });
      running.set(key, tracked);
      notify();
      return tracked;
    },
    active: (key) => running.has(key),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
