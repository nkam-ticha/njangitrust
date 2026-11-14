// D20.2: what a notification (and so a lock screen) says about a proposal. A solidarity request
// stays neutral there; its event (deuil, maladie...) and its note are shown only in the app.
import type { ProposalType } from '@njangi/rules';
import type { Bilingual } from '@njangi/shared';
import { proposalTexts } from '@njangi/shared/i18n/server/proposals';
import { bilingual } from '../../lib/texts';

const NEUTRAL = {
  opened: proposalTexts.solidarityOpenedBody,
  reminder: proposalTexts.solidarityReminderBody,
  result: proposalTexts.solidarityResultBody,
} as const;

/** The notification body for a proposal at `moment`: `detailed`, unless the type stays neutral. */
export function noticeBody(
  type: ProposalType,
  moment: keyof typeof NEUTRAL,
  group: { name: string },
  detailed: Bilingual,
): Bilingual {
  if (type !== 'SOLIDARITY_PAYOUT') return detailed;
  return bilingual(NEUTRAL[moment], { group: group.name });
}
