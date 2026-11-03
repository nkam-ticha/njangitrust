// Structured logs (spec 2.15): JSON lines with the request id on every line, and redaction of
// PINs, tokens, cookies, authorization headers and phone numbers (also inside free text).
import { pino, type Logger } from 'pino';
import { currentContext } from './request-context';
import { redact, redactText } from './redact';

function defaultLevel(): string {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;
  return process.env.NODE_ENV === 'test' ? 'silent' : 'info';
}

export const logger: Logger = pino({
  level: defaultLevel(),
  base: { service: 'njangitrust-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  messageKey: 'msg',
  mixin() {
    const context = currentContext();
    if (!context) return {};
    return {
      reqId: context.requestId,
      ...(context.userId ? { userId: context.userId } : {}),
    };
  },
  formatters: {
    log: (object) => redact(object),
  },
  hooks: {
    // The message string is not part of the object above; redact it too.
    logMethod(args, method) {
      const cleaned = args.map((arg) => (typeof arg === 'string' ? redactText(arg) : arg));
      method.apply(this, cleaned as never);
    },
  },
});

/** A child logger for one component: `const log = componentLogger('jobs')`. */
export function componentLogger(component: string): Logger {
  return logger.child({ component });
}
