// Building tool outcomes. An action tool returns to the model only `{ pendingActionId, summary }`
// (spec 4.5 step 2); the app draws the card from the server's PendingAction.
import { formatXAF, type Lang } from '@njangi/shared';
import { actionPreviewSchema } from '@njangi/shared/contracts/pending-actions';
import {
  agentTexts,
  agentUnavailableTexts,
  type AgentCapability,
} from '@njangi/shared/i18n/server/agent';
import type { PendingAction } from '../../lib/prisma';
import type { ToolOutcome } from './types';

/** The card in one line of the member's language: title, lines, total, notes. */
export function cardSummary(action: Pick<PendingAction, 'preview'>, lang: Lang): string {
  const preview = actionPreviewSchema.parse(action.preview);
  const parts = [preview.title[lang]];
  for (const line of preview.lines)
    parts.push(`${line.label[lang]} ${formatXAF(line.amount, lang)}`);
  if (preview.total !== null) {
    parts.push(`${preview.totalLabel?.[lang] ?? 'Total'} ${formatXAF(preview.total, lang)}`);
  }
  for (const note of preview.notes) parts.push(note[lang]);
  return parts.join(' · ');
}

export function prepared(
  action: Pick<PendingAction, 'id' | 'preview'>,
  lang: Lang,
  extra: { confidential?: boolean } = {},
): ToolOutcome {
  return {
    status: 'OK',
    // R11.5: the card of a secret vote says the choice. The model gets a neutral line instead, so
    // the choice is never sent back to the provider.
    data: {
      pendingActionId: action.id,
      summary: extra.confidential ? agentTexts.secretVoteReply[lang] : cardSummary(action, lang),
    },
    pendingActionId: action.id,
    ...(extra.confidential ? { confidential: true } : {}),
  };
}

export function ok(
  data: unknown,
  extra: Omit<Extract<ToolOutcome, { status: 'OK' }>, 'status' | 'data'> = {},
): ToolOutcome {
  return { status: 'OK', data, ...extra };
}

export function unavailable(capability: AgentCapability, lang: Lang): ToolOutcome {
  return { status: 'UNAVAILABLE', capability, message: agentUnavailableTexts[capability][lang] };
}

export function refused(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ToolOutcome {
  return { status: 'REFUSED', code, message, ...(details ? { details } : {}) };
}
