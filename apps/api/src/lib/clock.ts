// The only place in the API that reads the time (TEAM.md). Everything else asks `clock.now()`,
// so tests can move time (expiries, lockouts, holds) without waiting.

import { readFileSync } from 'node:fs';

type TimeSource = () => Date;

/**
 * Development only: a demo clock. `apps/api/.demo-clock` holds a number of milliseconds that every
 * local process (the API, its jobs, the evaluation, the demo scripts) adds to the real time, so a
 * demo can show a deadline passing or a payout opening without waiting. `scripts/demo-clock.ts`
 * writes it. It does nothing outside NODE_ENV=development: no file is read in tests or in production, and
 * there is no route that can move it.
 */
const DEMO_CLOCK_FILE = new URL('../../.demo-clock', import.meta.url);
let demoOffset = { readAt: 0, ms: 0 };

/** The demo clock's offset in milliseconds (0 outside development). */
export function demoClockOffsetMs(): number {
  if (process.env.NODE_ENV !== 'development') return 0;
  const now = Date.now();
  if (now - demoOffset.readAt < 500) return demoOffset.ms;
  let ms = 0;
  try {
    const value = Number(readFileSync(DEMO_CLOCK_FILE, 'utf8').trim());
    if (Number.isSafeInteger(value) && value >= 0) ms = value;
  } catch {
    // No file: the real time.
  }
  demoOffset = { readAt: now, ms };
  return ms;
}

const systemTime: TimeSource = () => new Date(Date.now() + demoClockOffsetMs());
let source: TimeSource = systemTime;

export const clock = {
  /** The current instant (UTC). */
  now(): Date {
    return source();
  },
  /** Milliseconds since the epoch, for durations. */
  nowMs(): number {
    return source().getTime();
  },
};

function assertTest(): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('The clock can only be changed in tests');
}

/** Tests only: freezes the clock at an instant. */
export function setTestClock(at: Date): void {
  assertTest();
  const frozen = new Date(at.getTime());
  source = () => new Date(frozen.getTime());
}

/** Tests only: moves a frozen (or real) clock forward. */
export function advanceTestClock(ms: number): void {
  assertTest();
  const next = new Date(source().getTime() + ms);
  source = () => new Date(next.getTime());
}

/** Tests only: back to real time. */
export function resetTestClock(): void {
  source = systemTime;
}
