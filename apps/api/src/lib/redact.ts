// Redaction of anything written outside the database's own columns: logs, audit details, stored
// agent tool arguments (CLAUDE.md rule 11, spec 2.15, 4.8). PINs, tokens, cookies, authorization
// headers and phone numbers never survive it, including phone numbers inside free text.
import { maskPhonesInText } from '@njangi/shared';

export const REDACTED = '[redacted]';

// Keys are compared lowercased without '-' and '_' ("set-cookie" -> "setcookie").
const SENSITIVE_SUFFIXES = [
  'pin',
  'pinhash',
  'password',
  'secret',
  'token',
  'tokenhash',
  'authorization',
  'cookie',
  'apikey',
  'phone',
  'phonehash',
  'phonesnapshot',
  'paymentnumber',
  'signature',
  'link',
];
const SENSITIVE_EXACT = new Set(['number', 'sig', 'msisdn']);

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[-_]/g, '');
  return SENSITIVE_EXACT.has(k) || SENSITIVE_SUFFIXES.some((suffix) => k.endsWith(suffix));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWT = /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}/g;
const BEARER = /\bBearer\s+[\w.~+/=-]+/gi;
// Long opaque tokens (link tokens, refresh tokens, signatures), e.g. inside a logged URL.
const OPAQUE_TOKEN = /[A-Za-z0-9_-]{40,}/g;

/** Masks tokens and phone numbers in free text. UUIDs pass through unchanged. */
export function redactText(text: string): string {
  if (UUID.test(text)) return text;
  return maskPhonesInText(
    text.replace(JWT, '[jwt]').replace(BEARER, 'Bearer [redacted]').replace(OPAQUE_TOKEN, '[token]'),
    [],
  );
}

const MAX_DEPTH = 8;
const MAX_ITEMS = 100;

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactText(value);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (seen.has(value)) return '[circular]';
  if (depth >= MAX_DEPTH) return '[nested]';
  seen.add(value);
  if (value instanceof Error) {
    const err = value as Error & { code?: unknown; status?: unknown };
    return {
      type: err.name,
      message: redactText(err.message),
      ...(typeof err.code === 'string' || typeof err.code === 'number' ? { code: err.code } : {}),
      ...(typeof err.status === 'number' ? { status: err.status } : {}),
      ...(err.stack ? { stack: redactText(err.stack) } : {}),
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ITEMS).map((item) => redactValue(item, depth + 1, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redactValue(inner, depth + 1, seen);
  }
  return out;
}

/** A redacted deep copy: sensitive keys replaced, phone numbers and tokens masked in strings. */
export function redact<T>(value: T): T {
  return redactValue(value, 0, new WeakSet()) as T;
}
