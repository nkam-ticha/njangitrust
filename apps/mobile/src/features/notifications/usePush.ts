// Push on the phone (spec 1.8, D1, D21): ask for the permission once, give the server this phone's
// Expo token (POST /v1/me/devices), and open the right screen when a notification is tapped.
// Nothing here runs on the web, and nothing here can crash the app: a refusal, Expo Go limits or a
// missing network leave the status at "denied", "expoGo" or "failed" and the app works as before.
import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { api } from '@/api/client';
import { useSession } from '@/state/session';
import { pushDevice } from './pushDevice';
import { isExpoPushToken, type PushStatus } from './pushSupport';
import { useMarkRead } from './useNotifications';
import { useOpenLink } from './useOpenLink';

const ASKED_KEY = 'njangi.push.asked';

const usePushStore = create<{ status: PushStatus; busy: boolean }>(() => ({
  status: 'unknown',
  busy: false,
}));

export const usePushStatus = () => usePushStore((s) => s);

/**
 * Reads the permission (asking when `ask` is set and the member has not been asked), then saves the
 * phone's token on the server. The status tells the settings screen what to show.
 */
export async function syncPush(options: { ask: boolean }): Promise<PushStatus> {
  const set = (status: PushStatus, busy = false) => usePushStore.setState({ status, busy });
  const support = pushDevice.support();
  if (support !== 'ok') {
    set(support);
    return support;
  }
  usePushStore.setState({ busy: true });
  try {
    let permission = await pushDevice.permission();
    if (permission === 'undetermined' && options.ask) permission = await pushDevice.ask();
    if (permission !== 'granted') {
      const status = permission === 'denied' ? 'denied' : 'undetermined';
      set(status);
      return status;
    }
    const token = await pushDevice.token();
    if (!isExpoPushToken(token)) throw new Error('PUSH_TOKEN_SHAPE');
    await api.post('/v1/me/devices', { platform: pushDevice.platform(), expoPushToken: token });
    set('registered');
    return 'registered';
  } catch {
    // Offline, no EAS project id in a test build, the server refused: the in-app list still works.
    set('failed');
    return 'failed';
  }
}

/** Once per sign-in: gives the server this phone's token, asking for the permission the first time. */
export function usePushRegistration(): void {
  const userId = useSession((s) => s.user?.id);
  useEffect(() => {
    if (!userId || pushDevice.support() === 'web') return;
    let cancelled = false;
    void (async () => {
      let asked = true;
      try {
        asked = (await AsyncStorage.getItem(ASKED_KEY)) !== null;
      } catch {
        // storage unavailable: do not ask, the settings screen has the button
      }
      if (cancelled) return;
      await syncPush({ ask: !asked });
      if (!asked) {
        try {
          await AsyncStorage.setItem(ASKED_KEY, '1');
        } catch {
          // asked again at the next sign-in at worst
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
}

/** A tap on a notification (the app open, in the background or closed) marks it read and opens its screen. */
export function usePushTaps(): void {
  const open = useOpenLink();
  const { mutate: markRead } = useMarkRead();
  const latest = useRef({ open, markRead });
  useEffect(() => {
    latest.current = { open, markRead };
  });
  useEffect(
    () =>
      pushDevice.onTap((tap) => {
        if (tap.notificationId) latest.current.markRead({ ids: [tap.notificationId] });
        latest.current.open(tap.deepLink);
      }),
    [],
  );
}
