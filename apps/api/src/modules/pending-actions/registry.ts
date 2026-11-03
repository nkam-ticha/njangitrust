// The registry of action handlers. Modules register at start-up (src/modules/register.ts).
import type { ActionHandler } from './pending-actions.types';

const handlers = new Map<string, ActionHandler>();

const TYPE = /^[A-Z][A-Z0-9_]{2,40}$/;

export function registerActionHandler<A>(handler: ActionHandler<A>): void {
  if (!TYPE.test(handler.type)) throw new Error(`Invalid action type ${handler.type}`);
  const existing = handlers.get(handler.type);
  if (existing && existing !== (handler as ActionHandler)) {
    throw new Error(`Action type ${handler.type} is already registered`);
  }
  handlers.set(handler.type, handler as ActionHandler);
}

export function getActionHandler(type: string): ActionHandler | undefined {
  return handlers.get(type);
}

export function registeredActionTypes(): string[] {
  return [...handlers.keys()].sort();
}
