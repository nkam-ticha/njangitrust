// What the phone's notification module offers, so the rest of the app never imports it directly
// (it logs errors in Expo Go on Android and does not exist on the web).
import type { PushSupport } from './pushSupport';

export type PushPermission = 'granted' | 'denied' | 'undetermined';

/** The part of a push the app needs: the notice it belongs to and where it leads (no personal data). */
export interface PushTap {
  notificationId: string | null;
  deepLink: string | null;
}

export interface PushDevice {
  support(): PushSupport;
  platform(): 'ANDROID' | 'IOS' | 'WEB';
  /** Reads the permission without asking. */
  permission(): Promise<PushPermission>;
  /** Shows the system prompt (once per install on iPhone), then answers. */
  ask(): Promise<PushPermission>;
  /** The Expo push token of this phone; throws when it cannot be had (offline, no project id). */
  token(): Promise<string>;
  /** Calls back when the member taps a notification, also the one that opened the app. */
  onTap(listener: (tap: PushTap) => void): () => void;
}
