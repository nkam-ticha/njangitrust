// Spec 5.3: every response is scanned for phone numbers that don't belong to the requester; any
// match fails the test. Applied automatically by the `api()` client to every response.
import { normalizeCameroonPhone } from '@njangi/shared';

// The output-guard pattern (spec 4.8), but not inside longer tokens (UUIDs, hashes, base64).
const PHONE_IN_TEXT = /(?<![\w-])(?:\+?237[\s.-]?)?6(?:[\s.-]?\d){8}(?![\w-])/g;
const OPAQUE = /^[0-9a-f-]{32,}$|^[A-Za-z0-9_-]{40,}$/i;

function scanString(text: string, found: string[]): void {
  if (OPAQUE.test(text)) return;
  for (const match of text.matchAll(PHONE_IN_TEXT)) {
    const normalized = normalizeCameroonPhone(match[0]);
    if (normalized) found.push(normalized);
  }
}

function walk(value: unknown, found: string[]): void {
  if (typeof value === 'string') scanString(value, found);
  else if (typeof value === 'number' && /^(237)?6\d{8}$/.test(String(value)))
    found.push(`+237${String(value).slice(-9)}`);
  else if (Array.isArray(value)) value.forEach((item) => walk(item, found));
  else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      scanString(key, found);
      walk(inner, found);
    }
  }
}

/** Phone numbers in `value` other than the `allowed` ones (the requester's own). */
export function foreignPhones(value: unknown, allowed: readonly string[]): string[] {
  const found: string[] = [];
  walk(value, found);
  return [...new Set(found)].filter((phone) => !allowed.includes(phone));
}

export function assertNoForeignPhones(
  value: unknown,
  allowed: readonly string[],
  where: string,
): void {
  const leaks = foreignPhones(value, allowed);
  if (leaks.length > 0) {
    // Show only a masked form, even in a failing test.
    const masked = leaks.map((p) => `${p.slice(0, 5)}•••${p.slice(-2)}`);
    throw new Error(`Phone number leak in ${where}: ${masked.join(', ')}`);
  }
}
