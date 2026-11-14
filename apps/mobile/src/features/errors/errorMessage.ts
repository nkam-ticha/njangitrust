// Turns an API error into the words a member reads (spec 1.6: what happened and what to do).
// Known codes map to the designer's copy; anything else shows the server's own bilingual message.
import type { TFunction } from 'i18next';
import { formatClock, type Lang } from '@njangi/shared';
import { ApiError, NETWORK_UNAVAILABLE } from '@/api/client';

/** `details` from the error body (attemptsLeft, retryAfterSeconds…), when the client exposes it. */
export function errorDetails(error: unknown): Record<string, unknown> {
  const details = (error as { details?: unknown } | null)?.details;
  return details && typeof details === 'object' ? (details as Record<string, unknown>) : {};
}

export function errorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : 'UNKNOWN';
}

/** "14:47": the time a lock ends, from `retryAfterSeconds`. */
export function unlockTime(error: unknown, lang: Lang, now: Date = new Date()): string | null {
  const seconds = errorDetails(error).retryAfterSeconds;
  return typeof seconds === 'number'
    ? formatClock(new Date(now.getTime() + seconds * 1000), lang)
    : null;
}

export function errorMessage(
  error: unknown,
  t: TFunction,
  lang: Lang,
  context: { inviter?: string } = {},
): string {
  if (!(error instanceof ApiError)) return t('errors.generic.body');
  const attemptsLeft = errorDetails(error).attemptsLeft;
  switch (error.code) {
    case NETWORK_UNAVAILABLE:
      return t('errors.network');
    case 'INVALID_CREDENTIALS':
    case 'INVALID_CREDENTIALS_LAST_ATTEMPT':
      return typeof attemptsLeft === 'number'
        ? t('login.wrongPin', { count: attemptsLeft })
        : t('login.wrongPin', { count: error.code.endsWith('LAST_ATTEMPT') ? 1 : 4 });
    case 'PIN_INCORRECT':
    case 'PIN_INCORRECT_LAST_ATTEMPT':
      return t('pinSheet.wrong', {
        count:
          typeof attemptsLeft === 'number'
            ? attemptsLeft
            : error.code.endsWith('LAST_ATTEMPT')
              ? 1
              : 2,
      });
    case 'LOGIN_LOCKED':
    case 'PIN_LOCKED': {
      const time = unlockTime(error, lang);
      if (time)
        return error.code === 'LOGIN_LOCKED'
          ? t('login.locked', { time })
          : t('pinSheet.locked', { time });
      break;
    }
    case 'PIN_TOO_WEAK':
      return t('signup.pin.tooSimple');
    case 'PHONE_ALREADY_REGISTERED':
      return t('signup.loginPhone.alreadyUsed');
    case 'INVITE_EXPIRED':
      if (context.inviter) return t('invite.landing.expired', { inviter: context.inviter });
      break;
    case 'INVITE_USED':
      return t('invite.landing.used');
    case 'INVITE_PHONE_MISMATCH':
      return t('invite.landing.wrongPhone');
    case 'INVITE_NOT_FOUND':
      return t('invite.landing.invalid');
    case 'PIN_RESET_LINK_INVALID':
      return t('pinReset.set.expired');
    case 'FIRST_PAYOUT_IN_PAST':
      return t('errors.validation.dateInPast');
    case 'ADMIN_ONLY':
      return t('errors.adminOnly');
    case 'RATE_LIMITED':
      return t('errors.rateLimited', { time: unlockTime(error, lang) ?? '' });
    default:
      break;
  }
  if (error.status >= 500) return t('errors.server');
  const server = lang === 'en' ? error.messageEn : error.messageFr;
  return server || t('errors.generic.body');
}
