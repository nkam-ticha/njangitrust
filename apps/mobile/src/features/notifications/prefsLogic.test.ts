import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUIET_HOURS,
  MUTABLE_CATEGORIES,
  NO_QUIET_HOURS,
  quietHoursAfterToggle,
  quietHoursOn,
  withCategory,
  withMutedGroup,
} from './prefsLogic';
import { isExpoPushToken, pushSupportFor } from './pushSupport';

describe('notification settings', () => {
  it('never offers Security as a category that can be turned off', () => {
    expect(MUTABLE_CATEGORIES).not.toContain('SECURITY');
    expect(withCategory(['MONEY'], 'SECURITY', false)).toEqual(['MONEY']);
  });

  it('turns a category off and back on without duplicates', () => {
    const off = withCategory([], 'VOTES', false);
    expect(off).toEqual(['VOTES']);
    expect(withCategory(off, 'VOTES', false)).toEqual(['VOTES']);
    expect(withCategory(off, 'VOTES', true)).toEqual([]);
  });

  it('mutes and unmutes a group chat once', () => {
    const muted = withMutedGroup(['a'], 'b', true);
    expect(muted).toEqual(['a', 'b']);
    expect(withMutedGroup(muted, 'b', true)).toEqual(['a', 'b']);
    expect(withMutedGroup(muted, 'a', false)).toEqual(['b']);
  });

  it('reads equal start and end as no quiet hours, and defaults to 21:00 to 07:00', () => {
    expect(quietHoursOn(DEFAULT_QUIET_HOURS)).toBe(true);
    expect(quietHoursOn(NO_QUIET_HOURS)).toBe(false);
    expect(quietHoursAfterToggle(DEFAULT_QUIET_HOURS, false)).toEqual(NO_QUIET_HOURS);
    expect(quietHoursAfterToggle(NO_QUIET_HOURS, true)).toEqual(DEFAULT_QUIET_HOURS);
    expect(quietHoursAfterToggle({ from: '22:30', to: '06:00' }, true)).toEqual({
      from: '22:30',
      to: '06:00',
    });
  });
});

describe('push support', () => {
  it('is hidden on the web', () => {
    expect(pushSupportFor({ os: 'web', executionEnvironment: undefined })).toBe('web');
  });

  it('is unavailable in Expo Go on Android only', () => {
    expect(pushSupportFor({ os: 'android', executionEnvironment: 'storeClient' })).toBe('expoGo');
    expect(pushSupportFor({ os: 'ios', executionEnvironment: 'storeClient' })).toBe('ok');
    expect(pushSupportFor({ os: 'android', executionEnvironment: 'standalone' })).toBe('ok');
    expect(pushSupportFor({ os: 'android', executionEnvironment: 'bare' })).toBe('ok');
  });

  it('checks the token shape the server accepts', () => {
    expect(isExpoPushToken('ExponentPushToken[abcdefghijklmnopqrstuv]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abcdefghij]')).toBe(true);
    expect(isExpoPushToken('ExponentPushToken[short]')).toBe(false);
    expect(isExpoPushToken('fcm-token')).toBe(false);
  });
});
