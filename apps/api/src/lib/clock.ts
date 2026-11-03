// The only place in the API that reads the time (TEAM.md). Everything else asks `clock.now()`,
// so tests can move time (expiries, lockouts, holds) without waiting.

type TimeSource = () => Date;

const systemTime: TimeSource = () => new Date();
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
