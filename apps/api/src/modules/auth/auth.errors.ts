// Auth errors. A wrong PIN on an action is 403, not 401: 401 means "session expired" to the app.
import { authErrorTexts as t } from '@njangi/shared/i18n/server/auth';
import { defineErrors } from '../../lib/errors';

export const authError = defineErrors({
  PIN_TOO_WEAK: { status: 400, text: t.PIN_TOO_WEAK },
  PIN_SAME_AS_OLD: { status: 400, text: t.PIN_SAME_AS_OLD },
  PHONE_ALREADY_REGISTERED: { status: 409, text: t.PHONE_ALREADY_REGISTERED },
  CONSENT_OUTDATED: { status: 409, text: t.CONSENT_OUTDATED },
  OPERATOR_REQUIRED: { status: 400, text: t.OPERATOR_REQUIRED },
  INVALID_CREDENTIALS: { status: 401, text: t.INVALID_CREDENTIALS },
  INVALID_CREDENTIALS_LAST_ATTEMPT: { status: 401, text: t.INVALID_CREDENTIALS_LAST_ATTEMPT },
  LOGIN_LOCKED: { status: 429, text: t.LOGIN_LOCKED },
  SESSION_INVALID: { status: 401, text: t.SESSION_INVALID },
  SESSION_REUSED: { status: 401, text: t.SESSION_REUSED },
  PIN_REQUIRED: { status: 400, text: t.PIN_REQUIRED },
  PIN_INCORRECT: { status: 403, text: t.PIN_INCORRECT },
  PIN_INCORRECT_LAST_ATTEMPT: { status: 403, text: t.PIN_INCORRECT_LAST_ATTEMPT },
  PIN_LOCKED: { status: 429, text: t.PIN_LOCKED },
  PIN_RESET_LINK_INVALID: { status: 410, text: t.PIN_RESET_LINK_INVALID },
  PIN_RESET_PHONE_MISMATCH: { status: 400, text: t.PIN_RESET_PHONE_MISMATCH },
  PIN_RESET_NOT_FOUND: { status: 404, text: t.PIN_RESET_NOT_FOUND },
  PIN_RESET_NOT_ALLOWED: { status: 403, text: t.PIN_RESET_NOT_ALLOWED },
  PIN_RESET_ALREADY_CONFIRMED: { status: 409, text: t.PIN_RESET_ALREADY_CONFIRMED },
});
