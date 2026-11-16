// The words of a result event (spec 4.5 step 5), from the server's PendingAction only: the card's
// title, the handler's own result summary ("Payé, réf. MP2611…") or the failure reason.
import { bilingual, type Bilingual } from '@njangi/shared';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { agentTexts } from '@njangi/shared/i18n/server/agent';

export const EVENT_STATUSES = ['DONE', 'FAILED', 'CANCELLED', 'EXPIRED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export function isEventStatus(status: string): status is EventStatus {
  return (EVENT_STATUSES as readonly string[]).includes(status);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function eventText(
  action: Pick<PendingActionDto, 'preview' | 'result' | 'failure'>,
  status: EventStatus,
): Bilingual {
  const title = action.preview.title;
  switch (status) {
    case 'DONE': {
      const summary = action.result?.summary;
      const ref = action.result?.ref && !UUID.test(action.result.ref) ? action.result.ref : null;
      const base = summary
        ? bilingual(agentTexts.actionDoneWithSummary, { title, summary })
        : bilingual(agentTexts.actionDone, { title });
      // A provider reference the summary does not already quote ("réf. MP2611…").
      if (!ref || base.fr.includes(ref)) return base;
      return { fr: `${base.fr} Réf. ${ref}.`, en: `${base.en} Ref. ${ref}.` };
    }
    case 'FAILED':
      return bilingual(agentTexts.actionFailed, {
        title,
        reason: { fr: action.failure?.messageFr ?? '', en: action.failure?.messageEn ?? '' },
      });
    case 'CANCELLED':
      return bilingual(agentTexts.actionCancelled, { title });
    case 'EXPIRED':
      return bilingual(agentTexts.actionExpired, { title });
  }
}
