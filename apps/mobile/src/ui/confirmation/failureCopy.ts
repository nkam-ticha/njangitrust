// Maps a PendingAction failure code to the designer's copy (confirmation.failed.<reason>), falling
// back to the server's own bilingual message (lead's decision, Phase B brief).
import type { TFunction } from 'i18next';
import type { Lang } from '@njangi/shared';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';

const REASONS = [
  'insufficientBalance',
  'declined',
  'operatorTimeout',
  'providerUnavailable',
  'invalidNumber',
  'disbursementFailed',
  'situationChanged',
  'alreadyPaid',
  'holdActive',
  'withdrawalsPaused',
  'limitExceeded',
  'voteClosed',
  'alreadyVoted',
  'notEligible',
  'generic',
] as const;
type Reason = (typeof REASONS)[number];

/** `INSUFFICIENT_BALANCE` or `insufficientBalance` → `insufficientBalance`. */
export function reasonFor(code: string): Reason | null {
  const camel = code.toLowerCase().replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
  return (REASONS as readonly string[]).includes(camel) ? (camel as Reason) : null;
}

export function failureCopy(
  failure: NonNullable<PendingActionDto['failure']>,
  t: TFunction,
  lang: Lang,
  vars: { operator: string; date?: string; amount?: string },
): { title: string; body: string } {
  const reason = reasonFor(failure.code);
  const server = lang === 'en' ? failure.messageEn : failure.messageFr;
  if (!reason || reason === 'notEligible') {
    return { title: t('confirmation.failed.generic.title'), body: server || t('confirmation.failed.generic.body') };
  }
  const v = { operator: vars.operator, date: vars.date ?? '', amount: vars.amount ?? '' };
  return { title: t(`confirmation.failed.${reason}.title`, v), body: t(`confirmation.failed.${reason}.body`, v) };
}
