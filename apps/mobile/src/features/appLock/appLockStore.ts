// The app lock's state (D36): the member's choice, kept on this phone only (never on the server), and
// whether the app is locked right now. The choice holds no secret: a switch and a delay.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { useSession } from '@/state/session';
import { APP_LOCK_OFF, parseAppLock, serializeAppLock, type AppLockSettings } from './appLockLogic';

const KEY = 'njangi.appLock';

interface AppLockState {
  settings: AppLockSettings;
  /** The stored choice has been read. */
  hydrated: boolean;
  locked: boolean;
  /** A biometric prompt is open: the app going inactive then must not count as leaving it. */
  authenticating: boolean;
}

export const useAppLock = create<AppLockState>(() => ({
  settings: APP_LOCK_OFF,
  hydrated: false,
  locked: false,
  authenticating: false,
}));

/** Whether this launch of the app restored a signed-in session (not a fresh login). */
let launchRestoredSession: boolean | null = null;
let coldStartHandled = false;

/**
 * Called once at app start (root layout): the first session status after "restoring" tells whether
 * the member was already signed in, in which case the lock asks for the fingerprint or face at once.
 * A member who has just typed their PIN to log in is not asked again.
 */
export function armColdStart(): void {
  if (launchRestoredSession !== null) return;
  const note = (status: string) => {
    if (status === 'restoring' || launchRestoredSession !== null) return;
    launchRestoredSession = status === 'signedIn';
  };
  note(useSession.getState().status);
  if (launchRestoredSession === null) {
    const stop = useSession.subscribe((s) => {
      note(s.status);
      if (launchRestoredSession !== null) stop();
    });
  }
}

/** Reads the stored choice; on the launch that restored a session and with the lock on, locks. */
export async function hydrateAppLock(): Promise<void> {
  // The lock is a phone feature (D1): on the web nothing is read and nothing is ever locked.
  if (Platform.OS === 'web') return;
  if (!useAppLock.getState().hydrated) {
    let raw: string | null = null;
    try {
      raw = await AsyncStorage.getItem(KEY);
    } catch {
      // storage unavailable: the lock stays off
    }
    useAppLock.setState({ settings: parseAppLock(raw), hydrated: true });
  }
  if (!coldStartHandled) {
    coldStartHandled = true;
    if (launchRestoredSession && useAppLock.getState().settings.enabled) {
      useAppLock.setState({ locked: true });
    }
  }
}

export async function saveAppLock(settings: AppLockSettings): Promise<void> {
  useAppLock.setState({ settings });
  try {
    await AsyncStorage.setItem(KEY, serializeAppLock(settings));
  } catch {
    // The choice holds for this session even if it could not be written.
  }
}

export const lockApp = () => useAppLock.setState({ locked: true });
export const unlockApp = () => useAppLock.setState({ locked: false });
export const setAuthenticating = (authenticating: boolean) =>
  useAppLock.setState({ authenticating });
