// Primitives shared by every API contract. Request schemas are strict: unknown keys are refused.
import { z } from 'zod';
import { LANGS } from '../lang';
import {
  findPhoneNumbers,
  looksLikePhoneNumber,
  normalizeCameroonPhone,
  withoutDates,
} from '../phone';

/** Stable codes put in `issue.message` by custom checks, so the app can show the right text. */
export const FIELD_CODES = {
  INVALID_PHONE: 'INVALID_PHONE',
  INVALID_PIN: 'INVALID_PIN',
  NAME_CONTAINS_PHONE: 'NAME_CONTAINS_PHONE',
  TEXT_CONTAINS_PHONE: 'TEXT_CONTAINS_PHONE',
  INVALID_TEXT: 'INVALID_TEXT',
} as const;

export const uuidSchema = z.string().uuid();

export const languageSchema = z.enum(LANGS);

/** A Cameroon mobile number in any common spelling, normalised to `+2376XXXXXXXX` (R13.1). */
export const phoneSchema = z
  .string()
  .max(32)
  .transform((value, ctx) => {
    const normalized = normalizeCameroonPhone(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: FIELD_CODES.INVALID_PHONE });
      return z.NEVER;
    }
    return normalized;
  });

/** Spec 2.10: exactly six digits. Guessable PINs are refused by the API's PIN policy. */
export const pinSchema = z.string().regex(/^\d{6}$/, FIELD_CODES.INVALID_PIN);

// Control characters (except tab and newline) are never accepted in stored text.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/**
 * True when a text carries a phone number, in any spelling: compatibility forms (fullwidth digits)
 * are folded with NFKC first, digits of other scripts are refused outright, and numbers split by
 * dashes, slashes, brackets or invisible characters are still found (privacy-guard M-B).
 */
export function containsPhoneNumber(text: string): boolean {
  const folded = text.normalize('NFKC');
  if (/[^\P{Nd}0-9]/u.test(folded)) return true;
  const scanned = withoutDates(folded);
  return findPhoneNumbers(scanned).length > 0 || looksLikePhoneNumber(scanned);
}

/**
 * Free text typed by a member and shown to others (a reason, a note, a correction): NFKC-folded,
 * trimmed, without control characters, and never carrying a phone number (spec 2.11).
 */
export function textSchema(max: number) {
  return z
    .string()
    .transform((v) => v.normalize('NFKC').trim())
    .pipe(z.string().min(1).max(max))
    .refine((v) => !CONTROL_CHARS.test(v), FIELD_CODES.INVALID_TEXT)
    .refine((v) => !containsPhoneNumber(v), FIELD_CODES.TEXT_CONTAINS_PHONE);
}

/**
 * A person's or a group's name. Names are shown to every member, so a name can never carry a
 * phone number (spec 2.11).
 */
export function nameSchema(max = 60) {
  return z
    .string()
    .transform((v) => v.normalize('NFKC').trim())
    .pipe(z.string().min(2).max(max))
    .refine((v) => !CONTROL_CHARS.test(v) && !/[\r\n\t]/.test(v), FIELD_CODES.INVALID_TEXT)
    .refine(
      (v) => !containsPhoneNumber(v) && !/\p{Nd}{5,}/u.test(v),
      FIELD_CODES.NAME_CONTAINS_PHONE,
    );
}

/** ISO 8601 instant with an offset, e.g. `2026-11-28T17:00:00.000Z`. */
export const instantSchema = z.string().datetime({ offset: true });

export const bilingualSchema = z.strictObject({ fr: z.string(), en: z.string() });

/** Integer number of FCFA (CLAUDE.md rule 1). */
export const fcfaSchema = z.number().int().refine(Number.isSafeInteger);

/** Every API error body (spec 2.7). `details` never carries personal data. */
export const apiErrorSchema = z.strictObject({
  code: z.string(),
  messageFr: z.string(),
  messageEn: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** One field problem in a VALIDATION_FAILED error: where, and a stable code. Never the value. */
export interface FieldIssue {
  path: string;
  code: string;
}

/** D1: header every web request carries (CSRF defence for cookie-authenticated requests). */
export const CLIENT_HEADER = 'x-njangi-client';
export const CLIENT_KINDS = ['mobile', 'web'] as const;
export type ClientKindHeader = (typeof CLIENT_KINDS)[number];
