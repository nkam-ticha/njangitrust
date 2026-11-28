// Where push notifications can work (D1, D21). Pure, so it is tested without a phone.
//
// - Web: no push, only the in-app notifications and realtime (D1). The push settings are hidden.
// - Expo Go on Android: SDK 53 removed remote push from Expo Go there, so the phone cannot register.
//   (Expo Go on iPhone can; a development or store build can on both.)
// - Everything else is a phone where we may ask for the permission and register a token.

export type PushSupport = 'ok' | 'web' | 'expoGo';

/** `Constants.executionEnvironment` of an app running inside the Expo Go client. */
export const EXPO_GO_ENVIRONMENT = 'storeClient';

export function pushSupportFor(env: {
  os: string;
  executionEnvironment: string | null | undefined;
}): PushSupport {
  if (env.os === 'web') return 'web';
  if (env.os === 'android' && env.executionEnvironment === EXPO_GO_ENVIRONMENT) return 'expoGo';
  return 'ok';
}

/** The shape the server accepts for an Expo push token (contracts/me registerDeviceRequestSchema). */
export const EXPO_PUSH_TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/;

export const isExpoPushToken = (value: string): boolean => EXPO_PUSH_TOKEN.test(value);

export type PushStatus =
  /** Not looked at yet. */
  | 'unknown'
  | 'web'
  | 'expoGo'
  /** The member has not been asked yet. */
  | 'undetermined'
  | 'denied'
  /** Allowed and the token is saved on the server. */
  | 'registered'
  /** Allowed, but the token could not be obtained or saved (offline, no project id in a test build). */
  | 'failed';
