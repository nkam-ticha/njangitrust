// Wires the lock to the app's life (D36): reads the member's choice, locks when the app opens with a
// restored session, and locks when the app returns from the background after the chosen delay.
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { biometrics } from './biometrics';
import { lockOnReturn } from './appLockLogic';
import { hydrateAppLock, lockApp, unlockApp, useAppLock } from './appLockStore';

export function useAppLockGate(): boolean {
  const locked = useAppLock((s) => s.locked);
  useEffect(() => {
    void hydrateAppLock();
    let leftAt: number | null = null;
    const sub = AppState.addEventListener('change', (next) => {
      const state = useAppLock.getState();
      // The system prompt itself makes the app inactive; only a real trip to the background counts.
      if (state.authenticating) return;
      if (next === 'background') leftAt = Date.now();
      if (next === 'active') {
        if (lockOnReturn({ settings: state.settings, leftAt, now: Date.now() })) lockApp();
        leftAt = null;
      }
    });
    return () => {
      sub.remove();
      // Signing out leaves nothing locked for the next person to log in.
      unlockApp();
    };
  }, []);
  // A lock whose biometrics vanished (the fingerprint removed in the phone's settings) must not trap
  // the member: the lock screen offers the PIN way in, and the check below drops a lock that cannot work.
  useEffect(() => {
    if (!locked) return;
    let cancelled = false;
    void biometrics.availability().then((a) => {
      if (!cancelled && (a === 'noHardware' || a === 'web')) unlockApp();
    });
    return () => {
      cancelled = true;
    };
  }, [locked]);
  return locked;
}
