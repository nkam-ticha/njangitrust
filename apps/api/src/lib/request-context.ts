// Per-request context carried across async calls, so every log line and audit entry knows its
// request id without passing it through every function (spec 2.15).
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  userId?: string;
  deviceId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Records the authenticated user on the current request's context. */
export function setContextUser(userId: string, deviceId?: string): void {
  const context = storage.getStore();
  if (!context) return;
  context.userId = userId;
  if (deviceId) context.deviceId = deviceId;
}
