// The last check of a private reply against the tools of its turn (spec 4.2, 4.5). The server, not
// the model, writes the sentence whenever the model's words and the tools disagree:
//   - a card exists but the reply says the action is done  -> "Voici la carte, confirme-la dans l'app"
//   - a card exists and the reply never mentions it         -> that sentence is added
//   - the reply claims a card nobody prepared                -> the real reason, or "I prepared nothing"
//   - the reply is empty after tools ran                     -> the same, from the tools
import type { Lang } from '@njangi/shared';
import { interpolate } from '@njangi/shared';
import { agentTexts } from '@njangi/shared/i18n/server/agent';
import { failureReason, verifyReply } from '../guards/claims';
import type { ToolRun } from '../tools/execute';

export interface Reconciled {
  text: string;
  /** `replace`: the streamed text must be reset; `append`: only the addition is streamed. */
  change: 'replace' | 'append' | null;
  /** What was added or substituted, for the stream. */
  streamed: string;
}

const hasCard = (runs: readonly ToolRun[]): boolean =>
  runs.some((r) => r.outcome.status === 'OK' && (r.outcome.pendingActionId || r.outcome.card));

/** The honest sentence when no card was prepared. */
export function notPreparedText(runs: readonly ToolRun[], lang: Lang): string {
  const reason = failureReason(runs, lang);
  return reason
    ? interpolate(agentTexts.couldNotPrepare[lang], { reason })
    : agentTexts.nothingPrepared[lang];
}

export function reconcileReply(
  reply: string,
  runs: readonly ToolRun[],
  lang: Lang,
  options: { guided?: boolean } = {},
): Reconciled {
  const replace = (text: string): Reconciled => ({ text, change: 'replace', streamed: text });
  if (reply.trim() === '') {
    if (hasCard(runs)) return replace(agentTexts.cardReady[lang]);
    if (runs.some((r) => r.outcome.status !== 'OK')) return replace(notPreparedText(runs, lang));
    return { text: reply, change: null, streamed: '' };
  }
  switch (verifyReply(reply, runs, options)) {
    case 'unsupported':
      return replace(notPreparedText(runs, lang));
    case 'overclaims-done':
      return replace(agentTexts.cardReady[lang]);
    case 'no-card-mention': {
      const addition = ` ${agentTexts.cardReadyHint[lang]}`;
      return { text: reply + addition, change: 'append', streamed: addition };
    }
    default:
      return { text: reply, change: null, streamed: '' };
  }
}
