// The short system notes the runtime adds between model calls (spec 4.2). They are written by the
// server, in English whatever the member's language (the language rule inside tells the model which
// one to answer in), and carry only tool statuses and field names: never a value the member typed.
import type { Lang } from '@njangi/shared';
import type { ToolRun } from '../tools/execute';

const languageRule = (lang: Lang): string =>
  lang === 'fr'
    ? 'Write the next reply entirely in French, use tu, and copy all dates and amounts exactly from the session or tool results.'
    : 'Write the next reply entirely in English, and copy all dates and amounts exactly from the session or tool results.';

const fields = (run: ToolRun): string =>
  run.outcome.status === 'INVALID'
    ? [...new Set(run.outcome.issues.map((i) => i.path))].join(', ')
    : '';

/**
 * The note after a step's tool results. Besides the language rule it tells the model what the
 * results mean: a refused or invalid call is not a prepared card, and a model gets one more step to
 * fix the arguments before it explains (the loop continues; MAX_TOOL_STEPS bounds it).
 */
export function stepNote(runs: readonly ToolRun[], lang: Lang): string {
  const parts = [languageRule(lang)];
  const invalid = runs.filter((r) => r.outcome.status === 'INVALID');
  const refused = runs.filter(
    (r) => r.outcome.status === 'REFUSED' || r.outcome.status === 'UNAVAILABLE',
  );
  const failed = runs.filter((r) => r.outcome.status === 'ERROR');
  const prepared = runs.some(
    (r) => r.outcome.status === 'OK' && (r.outcome.pendingActionId || r.outcome.card),
  );
  if (invalid.length > 0) {
    parts.push(
      `Tool ${invalid.map((r) => `${r.name} (${fields(r) || 'arguments'})`).join(', ')} returned INVALID: nothing was prepared. ` +
        'If the member’s message gives what is missing or wrong, call the tool again NOW with corrected arguments. ' +
        'If a required value is truly missing, ask ONE short question. ' +
        'Never say a card is ready after an INVALID result.',
    );
  }
  if (refused.length > 0) {
    parts.push(
      `Tool ${refused.map((r) => r.name).join(', ')} was REFUSED: nothing was prepared. ` +
        'Tell the member plainly that it could not be prepared and give the "reason" from the result, in their language. ' +
        'If the result names another tool or a way forward, call that tool now instead of only explaining. ' +
        'Never say a card is ready after a REFUSED result.',
    );
  }
  if (failed.length > 0) {
    parts.push(
      `Tool ${failed.map((r) => r.name).join(', ')} failed (ERROR): nothing was prepared. ` +
        'You may call it once more; if it fails again, say plainly that it did not work and to try again later.',
    );
  }
  if (prepared) {
    parts.push(
      'A confirmation card now exists for the member. Say in one short sentence that the card is ready and that they must confirm it in the app. ' +
        'Never say the action is done: only a result event proves that.',
    );
  }
  return parts.join(' ');
}

/** The model said a card or action was ready or done but no tool prepared one. */
export function unsupportedClaimNote(runs: readonly ToolRun[], lang: Lang): string {
  const last = runs.at(-1);
  const seen = last
    ? `The last tool result was ${last.outcome.status}${last.outcome.status === 'INVALID' ? ` (${fields(last)})` : ''}.`
    : 'You did not call any tool.';
  return (
    `Your reply said that a card or an action was ready or done, but no tool prepared one in this turn. ${seen} ` +
    'A card exists only when a tool returned status OK with a pendingActionId. ' +
    'Now either call the right tool with correct arguments, or tell the member plainly that it could not be prepared and why ' +
    '(use the reason from the tool result). ' +
    languageRule(lang)
  );
}

/** The model stated an amount that is in no tool result, event or message of this conversation. */
export function ungroundedAmountNote(amounts: readonly string[], lang: Lang): string {
  return (
    `Your reply states an amount (${amounts.join(', ')} FCFA) that appears in no tool result, session line or message of this conversation. ` +
    'Never state an amount you were not given. Call the tool that returns the figure the member asked about (for example get_my_overview for what they owe), ' +
    'then answer with the amounts it returns, copied exactly. ' +
    languageRule(lang)
  );
}

/** The member asked why a fine or debt applies and the model read the ledger only. */
export function explainRuleNote(lang: Lang): string {
  return (
    'The member asked why a fine or a debt applies. You read the ledger but did not call explain_rule. ' +
    'Call explain_rule NOW for the topic (for example "amende" or "fine"), then answer with the official rule and the ledger entry, ' +
    'including the exact deadline of the entry when the ledger gave one. ' +
    languageRule(lang)
  );
}

/** A French reply used "vous": the app speaks to members with "tu". */
export function tuNote(): string {
  return 'Your reply addressed the member as "vous". Rewrite it entirely in French with "tu", "ton", "ta", "tes", and never "vous", "votre" or "vos". Keep every fact and amount exactly as it was.';
}

/** The model said "I can't" without trying any tool. */
export function tryFirstNote(lang: Lang): string {
  return (
    'You told the member you cannot do this, but you tried no tool. If one of your tools can do what the member asked, ' +
    'call it NOW: the system will tell you if the rules refuse, and then you explain that reason. ' +
    'Only if no tool fits at all, repeat your answer, and point the member to the right screen of the app if you know it. ' +
    languageRule(lang)
  );
}
