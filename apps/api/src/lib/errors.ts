// API errors (spec 2.7, TEAM.md): every error body is `{ code, messageFr, messageEn, details? }`
// with a stable SCREAMING_SNAKE_CASE code. Each module declares its own errors with
// `defineErrors`, pairing the bilingual text from @njangi/shared with an HTTP status.
import type { Bilingual } from '@njangi/shared';
import { commonErrorTexts } from '@njangi/shared/i18n/server/common';
import { bilingual, type TextParams } from './texts';

/** Safe, non-personal details for the client: field paths, retry delays, attempts left. */
export type ErrorDetails = Record<string, unknown>;

export class AppError extends Error {
  override name = 'AppError';

  constructor(
    readonly code: string,
    readonly status: number,
    readonly text: Bilingual,
    readonly details?: ErrorDetails,
  ) {
    super(code);
  }

  toBody(): { code: string; messageFr: string; messageEn: string; details?: ErrorDetails } {
    return {
      code: this.code,
      messageFr: this.text.fr,
      messageEn: this.text.en,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export interface ErrorDefinition {
  status: number;
  text: Bilingual;
}

export interface ErrorOptions {
  params?: TextParams;
  details?: ErrorDetails;
}

/**
 * Declares a module's errors once and returns a typed factory:
 * `const fail = defineErrors({ X: { status: 409, text: texts.X } }); throw fail('X');`
 */
export function defineErrors<const T extends Record<string, ErrorDefinition>>(definitions: T) {
  return (code: keyof T & string, options: ErrorOptions = {}): AppError => {
    const def = definitions[code];
    if (!def) throw new Error(`Unknown error code ${code}`);
    return new AppError(code, def.status, bilingual(def.text, options.params), options.details);
  };
}

/** Errors every part of the API can raise. */
export const commonError = defineErrors({
  VALIDATION_FAILED: { status: 400, text: commonErrorTexts.VALIDATION_FAILED },
  INVALID_JSON: { status: 400, text: commonErrorTexts.INVALID_JSON },
  PAYLOAD_TOO_LARGE: { status: 413, text: commonErrorTexts.PAYLOAD_TOO_LARGE },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, text: commonErrorTexts.UNSUPPORTED_MEDIA_TYPE },
  UNAUTHENTICATED: { status: 401, text: commonErrorTexts.UNAUTHENTICATED },
  FORBIDDEN: { status: 403, text: commonErrorTexts.FORBIDDEN },
  NOT_FOUND: { status: 404, text: commonErrorTexts.NOT_FOUND },
  ROUTE_NOT_FOUND: { status: 404, text: commonErrorTexts.ROUTE_NOT_FOUND },
  RATE_LIMITED: { status: 429, text: commonErrorTexts.RATE_LIMITED },
  CSRF_HEADER_MISSING: { status: 403, text: commonErrorTexts.CSRF_HEADER_MISSING },
  ORIGIN_NOT_ALLOWED: { status: 403, text: commonErrorTexts.ORIGIN_NOT_ALLOWED },
  CONFLICT: { status: 409, text: commonErrorTexts.CONFLICT },
  INTERNAL: { status: 500, text: commonErrorTexts.INTERNAL },
  SERVICE_UNAVAILABLE: { status: 503, text: commonErrorTexts.SERVICE_UNAVAILABLE },
});

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
