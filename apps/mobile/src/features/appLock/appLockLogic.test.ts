import { describe, expect, it } from 'vitest';
import {
  APP_LOCK_OFF,
  DEFAULT_LOCK_DELAY,
  lockOnReturn,
  parseAppLock,
  serializeAppLock,
} from './appLockLogic';

const MIN = 60_000;
const on = (afterMinutes: 0 | 1 | 5) => ({ enabled: true, afterMinutes });

describe('app lock', () => {
  it('is off by default and when nothing readable is stored', () => {
    expect(APP_LOCK_OFF.enabled).toBe(false);
    expect(parseAppLock(null)).toEqual(APP_LOCK_OFF);
    expect(parseAppLock('')).toEqual(APP_LOCK_OFF);
    expect(parseAppLock('not json')).toEqual(APP_LOCK_OFF);
    expect(parseAppLock('{"enabled":"yes"}')).toEqual(APP_LOCK_OFF);
  });

  it('keeps what the member chose and repairs a delay it does not know', () => {
    expect(parseAppLock(serializeAppLock(on(1)))).toEqual(on(1));
    expect(parseAppLock('{"enabled":true,"afterMinutes":42}')).toEqual({
      enabled: true,
      afterMinutes: DEFAULT_LOCK_DELAY,
    });
  });

  it('locks again only after the chosen delay away from the app', () => {
    const settings = on(5);
    expect(lockOnReturn({ settings, leftAt: 0, now: 4 * MIN + 59_000 })).toBe(false);
    expect(lockOnReturn({ settings, leftAt: 0, now: 5 * MIN })).toBe(true);
    expect(lockOnReturn({ settings, leftAt: 0, now: 30 * MIN })).toBe(true);
  });

  it('locks on every return when the delay is zero', () => {
    expect(lockOnReturn({ settings: on(0), leftAt: 1000, now: 1000 })).toBe(true);
  });

  it('never locks when it is off or the app never left the foreground', () => {
    expect(lockOnReturn({ settings: APP_LOCK_OFF, leftAt: 0, now: 99 * MIN })).toBe(false);
    expect(lockOnReturn({ settings: on(0), leftAt: null, now: 99 * MIN })).toBe(false);
  });
});
