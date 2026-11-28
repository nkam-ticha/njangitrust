// The biometric app lock as plain rules (S-06, D4, D36), without any phone module so they are tested
// directly. The lock is optional and off by default. It asks again when the app comes back from the
// background after the chosen delay, and when the app is opened. It never replaces the PIN for
// sensitive actions (L2): those keep asking for the PIN.

/** The delays the member can choose (SCREENS S-06): at once, one minute, five minutes. */
export const LOCK_DELAYS = [0, 1, 5] as const;
export type LockDelayMinutes = (typeof LOCK_DELAYS)[number];

/** "A few minutes" (the owner's words): the delay a member gets when they turn the lock on. */
export const DEFAULT_LOCK_DELAY: LockDelayMinutes = 5;

export interface AppLockSettings {
  enabled: boolean;
  afterMinutes: LockDelayMinutes;
}

export const APP_LOCK_OFF: AppLockSettings = { enabled: false, afterMinutes: DEFAULT_LOCK_DELAY };

const isDelay = (value: unknown): value is LockDelayMinutes => LOCK_DELAYS.some((d) => d === value);

/** Reads what was stored; anything unreadable means "off" (never a lock the member did not choose). */
export function parseAppLock(raw: string | null | undefined): AppLockSettings {
  if (!raw) return APP_LOCK_OFF;
  try {
    const data = JSON.parse(raw) as { enabled?: unknown; afterMinutes?: unknown };
    return {
      enabled: data.enabled === true,
      afterMinutes: isDelay(data.afterMinutes) ? data.afterMinutes : DEFAULT_LOCK_DELAY,
    };
  } catch {
    return APP_LOCK_OFF;
  }
}

export const serializeAppLock = (settings: AppLockSettings): string => JSON.stringify(settings);

/**
 * Whether the app locks when it comes back to the foreground. `leftAt` is when it went to the
 * background (null when it never did: a cold start is handled by the caller). The delay is in
 * whole minutes; 0 locks on every return.
 */
export function lockOnReturn(input: {
  settings: AppLockSettings;
  leftAt: number | null;
  now: number;
}): boolean {
  if (!input.settings.enabled || input.leftAt === null) return false;
  return input.now - input.leftAt >= input.settings.afterMinutes * 60_000;
}
