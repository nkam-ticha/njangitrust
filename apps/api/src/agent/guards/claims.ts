// The claim guard (spec 4.2, 4.5): the words of a reply must match what the tools really did. A weak
// model can say "voici la carte" after a refused tool, or with no tool call at all, and the member
// then waits for a card that does not exist. These pure functions read the final text (French and
// English), compare it with the runs of the turn, and say what the runtime must do (runtime/turn.ts).
// They only read; the server writes the corrective sentences (agentTexts), never the model.
import { agentTexts } from '@njangi/shared/i18n/server/agent';
import type { Lang } from '@njangi/shared';
import { interpolate } from '@njangi/shared';
import type { ToolRun } from '../tools/execute';

/** The tools that act at once (preferences): "c'est fait" is true for them without a card. */
export const IMMEDIATE_TOOLS: ReadonlySet<string> = new Set([
  'set_language',
  'set_notification_prefs',
  'switch_group',
  'mark_chat_read',
  'mark_notifications_read',
]);

const plain = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’‘`]/g, "'");

/** Sentences worth testing: a question or a negation is not a claim ("je n'ai pas pu préparer"). */
function claimSentences(text: string): string[] {
  const NEGATED =
    /\b(pas|jamais|rien|aucun\w*|impossible|sans|not|never|cannot|nothing|unable|no)\b|n't\b|\bn'|\bcan't\b/;
  return plain(text)
    .split(/(?<=[.!?…\n])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.endsWith('?') && !NEGATED.test(s));
}

const CARD_CLAIMS: readonly RegExp[] = [
  // French
  /\bvoici (la|ta|une|cette|votre) (\w+ )?carte\b/,
  /\bcarte( \w+){0,3} (est|a ete|sont) (bien )?(prete|preparee|creee|generee|disponible)/,
  /\bj'ai (bien |juste |deja |bien deja )?(prepare|cree|genere|lance|publie|ajoute|propose|envoye|soumis|programme|planifie|paye|retire|vote|invite)/,
  /\bje (viens de|vous|te) (le |la |l')?(preparer|creer|lancer|publier|proposer|envoyer)\b/,
  /^confirme[- ](la|le|les)\b/,
  /\bc'est (deja )?(fait|bon|envoye|enregistre)\b/,
  /\bchose faite\b/,
  // English
  /\bhere(?:'s| is) (the|your|a|this) (\w+ )?card\b/,
  /\bcard( \w+){0,3} (is|has been|was) (ready|prepared|created|generated)\b/,
  /\bi(?:'ve| have)? (just |now )?(prepared|created|added|sent|started|submitted|published|proposed|scheduled|paid|withdrawn|voted|invited)\b/,
  /^(please )?confirm (it|the card|this)\b/,
  /\btap confirm\b/,
  /\b(it'?s|it is|that'?s) done\b/,
  /\bdone[.!]/,
  /\ball set\b/,
];

/** The reply says the action itself is finished (it cannot be before the result event). */
const DONE_CLAIMS: readonly RegExp[] = [
  /\bc'est (deja )?(fait|bon|envoye|paye|ajoute|enregistre)\b/,
  /\bchose faite\b/,
  /\bj'ai (bien |juste |deja )?(paye|retire|ajoute|envoye|vote|invite|supprime|change|valide|confirme|effectue|publie)/,
  /\b(est|a ete|sont|ont ete) (bien )?(ajoute|envoye|paye|retire|effectue|valide|supprime|enregistre|adopte|publie|invite)e?s?\b/,
  /\b(it'?s|it is|that'?s|all) done\b/,
  /\bdone[.!]/,
  /\bi(?:'ve| have)? (just |now )?(paid|withdrawn|added|sent|voted|invited|deleted|changed|completed|published)\b/,
  /\b(has|have|was|were) (been )?(added|sent|paid|withdrawn|completed|approved|deleted|published|submitted|invited)\b/,
];

const test = (text: string, patterns: readonly RegExp[]): boolean =>
  claimSentences(text).some((sentence) => patterns.some((p) => p.test(sentence)));

/** The reply says a card, a proposal or an action is ready or done. */
export function claimsCard(text: string): boolean {
  return test(text, CARD_CLAIMS);
}

/** The reply says the action is finished, which only a result event can prove. */
export function claimsDone(text: string): boolean {
  return test(text, DONE_CLAIMS);
}

/** The reply already points the member to the card. */
export function mentionsCard(text: string): boolean {
  return /\b(carte|card|confirm\w*|valid\w*|app|application)\b/.test(plain(text));
}

/** A tool result that is a card the member can confirm, or the card of a read (a statement). */
const isPrepared = (run: ToolRun): boolean =>
  run.outcome.status === 'OK' && !!(run.outcome.pendingActionId || run.outcome.card);

const isSecretVote = (run: ToolRun): boolean =>
  run.outcome.status === 'OK' && run.outcome.confidential === true;

export type ReplyVerdict = 'fine' | 'unsupported' | 'overclaims-done' | 'no-card-mention';

/**
 * Does the reply agree with the tools of this turn?
 *  - unsupported: it claims a card or an action but no tool prepared one;
 *  - overclaims-done: a card exists but the text says the action is done;
 *  - no-card-mention: a card exists and the text does not say so;
 *  - fine: nothing to fix.
 * `guided`: the turn answered from the guide to the app, where "tu confirmes sur la carte" is
 * an explanation, not a claim.
 */
export function verifyReply(
  text: string,
  runs: readonly ToolRun[],
  options: { guided?: boolean } = {},
): ReplyVerdict {
  if (options.guided) return 'fine';
  const prepared = runs.some(isPrepared);
  const supported = prepared || runs.some(isSecretVote);
  const immediate = runs.some((r) => r.outcome.status === 'OK' && IMMEDIATE_TOOLS.has(r.name));
  const card = claimsCard(text);
  const done = claimsDone(text);
  if (!card && !done) return prepared && !mentionsCard(text) ? 'no-card-mention' : 'fine';
  if (immediate && !prepared) return 'fine';
  // Only a claim of the agent's own action or card is unsupported. A passive statement about the
  // state of things ("ton retrait a été effectué", "the payment has been sent") is a legitimate
  // answer from a read tool, so it is checked only against a card (overclaims-done below).
  if (!supported) return card ? 'unsupported' : 'fine';
  if (prepared && done) return 'overclaims-done';
  return 'fine';
}

/** The reason of a failed tool, in the member's words, or null when nothing failed. */
export function failureReason(runs: readonly ToolRun[], lang: Lang): string | null {
  const failed = runs.filter((r) => r.outcome.status !== 'OK');
  if (failed.length === 0) return null;
  // The failed action explains more than a failed read next to it.
  const run = [...failed].reverse().find((r) => !r.name.startsWith('get_')) ?? failed.at(-1)!;
  const data = (run.modelData ?? {}) as Record<string, unknown>;
  switch (run.outcome.status) {
    case 'REFUSED':
      return run.outcome.message;
    case 'UNAVAILABLE':
      return run.outcome.message;
    case 'INVALID': {
      const issues = run.outcome.issues.filter((i) => i.path !== '(tool)');
      if (issues.length === 0) return agentTexts.nothingPrepared[lang];
      return interpolate(agentTexts.invalidReason[lang], {
        fields: [...new Set(issues.map((i) => i.path))].join(', '),
      });
    }
    case 'ERROR':
      return typeof data.message === 'string' ? data.message : agentTexts.nothingPrepared[lang];
    default:
      return null;
  }
}

/**
 * "I can't do that" said with no tool tried. Refusals the rules require (phone numbers, PINs,
 * confirming for the member, secret votes) are not flagged.
 */
export function refusesWithoutTrying(text: string): boolean {
  const t = plain(text);
  const REFUSAL =
    /\bje ne (peux|sais|suis) pas\b|\bje n'ai pas (la possibilite|acces|les moyens|le droit)\b|\bimpossible (de|pour moi)\b|\bje ne suis pas (capable|en mesure)\b|\bi (can't|cannot|can not|am not able|am unable)\b|\bi'm (not able|unable)\b|\bunfortunately,? i\b|\bnot able to\b/;
  const REQUIRED =
    /\b(numero|telephone|phone|number|pin|secret|confirm\w*|valider|voter a la place|pour un autre|for (another|someone)|directement|directly)\b/;
  return REFUSAL.test(t) && !REQUIRED.test(t);
}
