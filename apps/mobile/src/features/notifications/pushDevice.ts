// Phones: the push permission, the Expo push token and the tap on a notification, through
// expo-notifications. The module is loaded only after `support()` says it can work, because inside
// Expo Go on Android it logs an error at import time (remote push left Expo Go there in SDK 53).
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import type { PushDevice, PushPermission, PushTap } from './pushDevice.types';
import { pushSupportFor } from './pushSupport';

type Notifications = typeof NotificationsModule;

const support = () =>
  pushSupportFor({ os: Platform.OS, executionEnvironment: Constants.executionEnvironment });

async function load(): Promise<Notifications> {
  if (support() !== 'ok') throw new Error('PUSH_UNSUPPORTED');
  return import('expo-notifications');
}

function toPermission(status: { granted: boolean; canAskAgain: boolean }): PushPermission {
  if (status.granted) return 'granted';
  return status.canAskAgain ? 'undetermined' : 'denied';
}

/** Android needs a channel before it shows anything, and before the permission is asked (13+). */
async function ensureChannel(N: Notifications): Promise<void> {
  if (Platform.OS !== 'android') return;
  await N.setNotificationChannelAsync('default', {
    name: 'NjangiTrust',
    importance: N.AndroidImportance.DEFAULT,
  });
}

/** The data the server puts in a push: `{ notificationId, deepLink }`, nothing else. */
function tapOf(data: unknown): PushTap {
  const record = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    notificationId: typeof record.notificationId === 'string' ? record.notificationId : null,
    deepLink: typeof record.deepLink === 'string' ? record.deepLink : null,
  };
}

export const pushDevice: PushDevice = {
  support,
  platform: () => (Platform.OS === 'ios' ? 'IOS' : 'ANDROID'),
  async permission() {
    const N = await load();
    return toPermission(await N.getPermissionsAsync());
  },
  async ask() {
    const N = await load();
    await ensureChannel(N);
    const asked = await N.requestPermissionsAsync();
    // After a refusal the system will not ask again: the member must use the phone's settings.
    return asked.granted ? 'granted' : 'denied';
  },
  async token() {
    const N = await load();
    await ensureChannel(N);
    // The project id comes from the EAS configuration of the build (none in a plain Expo Go run).
    const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
    const eas = (Constants as { easConfig?: { projectId?: unknown } }).easConfig;
    const projectId: unknown = eas?.projectId ?? extra?.eas?.projectId;
    const token = await N.getExpoPushTokenAsync(
      typeof projectId === 'string' ? { projectId } : undefined,
    );
    return token.data;
  },
  onTap(listener) {
    let stopped = false;
    let remove: (() => void) | null = null;
    void load()
      .then(async (N) => {
        if (stopped) return;
        const sub = N.addNotificationResponseReceivedListener((response) =>
          listener(tapOf(response.notification.request.content.data)),
        );
        remove = () => sub.remove();
        // The notification that opened the app from a closed state.
        const first = await N.getLastNotificationResponseAsync();
        if (first && !stopped) {
          listener(tapOf(first.notification.request.content.data));
          await N.clearLastNotificationResponseAsync();
        }
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
      remove?.();
    };
  },
};
