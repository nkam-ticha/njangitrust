// Sending pushes through the Expo Push Service (spec 2.13): in chunks, keeping one ticket per
// message, and checking receipts later. Tests install a recording sender instead.
import { randomUUID } from 'node:crypto';
import Expo, { type ExpoPushMessage } from 'expo-server-sdk';
import { getEnv } from '../../config/env';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** Only ids and an app route: never personal data (lock screens show pushes). */
  data: { notificationId: string; deepLink: string | null };
}

export type PushTicketResult = { ok: true; ticketId: string } | { ok: false; error: string };
export type PushReceiptResult = { ok: true } | { ok: false; error: string };

export interface PushSender {
  /** One result per message, in order. */
  send(messages: readonly PushMessage[]): Promise<PushTicketResult[]>;
  receipts(ticketIds: readonly string[]): Promise<Map<string, PushReceiptResult>>;
}

function errorCode(e: { message: string; details?: { error?: string } }): string {
  return e.details?.error ?? 'ExpoError';
}

export class ExpoPushSender implements PushSender {
  private readonly expo: Expo;

  constructor(accessToken: string | undefined) {
    this.expo = new Expo(accessToken ? { accessToken } : {});
  }

  async send(messages: readonly PushMessage[]): Promise<PushTicketResult[]> {
    const results: PushTicketResult[] = [];
    const prepared: ExpoPushMessage[] = messages.map((m) => ({
      to: m.to,
      title: m.title,
      body: m.body,
      data: m.data,
      sound: 'default',
      priority: 'high',
    }));
    for (const chunk of this.expo.chunkPushNotifications(prepared)) {
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
        for (const t of tickets)
          results.push(
            t.status === 'ok' ? { ok: true, ticketId: t.id } : { ok: false, error: errorCode(t) },
          );
      } catch {
        for (let i = 0; i < chunk.length; i += 1) results.push({ ok: false, error: 'SendFailed' });
      }
    }
    return results;
  }

  async receipts(ticketIds: readonly string[]): Promise<Map<string, PushReceiptResult>> {
    const out = new Map<string, PushReceiptResult>();
    for (const chunk of this.expo.chunkPushNotificationReceiptIds([...ticketIds])) {
      try {
        const receipts = await this.expo.getPushNotificationReceiptsAsync(chunk);
        for (const [id, r] of Object.entries(receipts))
          out.set(id, r.status === 'ok' ? { ok: true } : { ok: false, error: errorCode(r) });
      } catch {
        // Receipts are retried by the next run.
      }
    }
    return out;
  }
}

/** Records instead of sending: the default in tests, so no test ever reaches the network. */
export class RecordingPushSender implements PushSender {
  readonly sent: PushMessage[] = [];
  /** Tokens the fake service answers with DeviceNotRegistered. */
  readonly unregistered = new Set<string>();

  send(messages: readonly PushMessage[]): Promise<PushTicketResult[]> {
    this.sent.push(...messages);
    return Promise.resolve(
      messages.map((m) =>
        this.unregistered.has(m.to)
          ? { ok: false, error: 'DeviceNotRegistered' }
          : { ok: true, ticketId: randomUUID() },
      ),
    );
  }

  receipts(ticketIds: readonly string[]): Promise<Map<string, PushReceiptResult>> {
    return Promise.resolve(new Map(ticketIds.map((id) => [id, { ok: true } as const])));
  }
}

let sender: PushSender | undefined;

export function getPushSender(): PushSender {
  sender ??=
    process.env.NODE_ENV === 'test'
      ? new RecordingPushSender()
      : new ExpoPushSender(getEnv().EXPO_ACCESS_TOKEN);
  return sender;
}

/** Tests only: replaces the sender. */
export function setPushSenderForTests(next: PushSender): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('test only');
  sender = next;
}

export const isExpoPushToken = (token: string) => Expo.isExpoPushToken(token);
