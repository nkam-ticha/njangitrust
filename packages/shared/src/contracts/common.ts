// Primitives shared by every API contract. Request schemas are strict: unknown keys are refused.
import { z } from 'zod';
import { LANGS } from '../lang';
import { findPhoneNumbers, normalizeCameroonPhone } from '../phone';

/** Stable codes put in `issue.message` by custom checks, so the app can show the right text. */
export const FIELD_CODES = {
  INVALID_PHONE: 'INVALID_PHONE',
  INVALID_PIN: 'INVALID_PIN',
  NAME_CONTAINS_PHONE: 'NAME_CONTAINS_PHONE',
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
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** Free text typed by a member (a reason, a note), trimmed, without control characters. */
export function textSchema(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !CONTROL_CHARS.test(v), FIELD_CODES.INVALID_TEXT);
}

/**
 * A person's or a group's name. Names are shown to every member, so a name can never carry a
 * phone number (spec 2.11).
 */
export function nameSchema(max = 60) {
  return z
    .string()
    .trim()
    .min(2)
    .max(max)
    .refine((v) => !CONTROL_CHARS.test(v) && !/[\r\n\t]/.test(v), FIELD_CODES.INVALID_TEXT)
    .refine((v) => findPhoneNumbers(v).length === 0 && !/\d{5,}/.test(v), FIELD_CODES.NAME_CONTAINS_PHONE);
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
