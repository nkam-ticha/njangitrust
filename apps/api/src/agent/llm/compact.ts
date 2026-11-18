// Fitting a request to a provider, and handing a reply over from one provider to the next
// (spec 4.2, 4.11). Pure functions: no I/O, nothing is logged, nothing is invented.
//
// Why: the free tiers differ. Groq's free tier, for one, accepts about 7,000 input tokens a
// minute, and the full request (system prompt, 52 tool definitions, history) is over 9,000. A
// provider with a small budget is sent a SMALL IMPORTANT CONTEXT instead:
//   1. the system prompt, untouched (the rules live there);
//   2. the member's current message;
//   3. what this turn has already done: every tool call and its result (long results trimmed);
//   4. only the tools that can matter: the reading tools, the categories the message is about,
//      and any tool already used in this turn;
//   5. as much recent history as still fits, newest first — but always at least the last few
//      lines (MIN_HISTORY_LINES), so the model sees its own previous reply and understands
//      short follow-ups like "Yes" or "Oui".
// When a provider takes over in the middle of a reply, a short note says so, and the work of the
// turn so far travels with it as in (3), so the new model neither starts over nor repeats a tool.
import type { LlmMessage, LlmRequest, LlmToolSpec } from './types';

/** Characters per token: pessimistic on purpose (French, JSON), so a "fits" is a real fit. */
const CHARS_PER_TOKEN = 3.2;
/** A tool result longer than this is cut when the context is compact. */
const COMPACT_TOOL_RESULT_CHARS = 1_500;

export function estimateTokens(request: Pick<LlmRequest, 'messages' | 'tools'>): number {
  const chars = JSON.stringify(request.messages).length + JSON.stringify(request.tools).length;
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/** Words that say what a message is about, French and English. `reading` is always kept. */
const TOPICS: Record<string, RegExp> = {
  payments:
    /\b(pay\w*|paie\w*|cotis\w*|contribut\w*|retir\w*|withdraw\w*|vers\w*|mobile money|momo|mtn|orange|dû|dus|doit|dois|owe\w*|dues?|montant|amount|solde|balance|rembours\w*|receiv\w*|re[cç]u)\b/i,
  loans:
    /\b(pr[eê]t\w*|loan\w*|emprunt\w*|borrow\w*|rembours\w*|repay\w*|ench[eè]re\w*|bid\w*|bidding|int[eé]r[eê]t\w*|interest)\b/i,
  governance:
    /\b(vot\w*|propos\w*|r[eè]gle\w*|rule\w*|amende\w*|fines?|membres?|members?|invit\w*|admin\w*|quitt\w*|leave|rotation|tour|round|cycle|caisse|solidar\w*|secours|d[eé]cision|decision|chang\w*|modifi\w*|exclu\w*|expel|ajout\w*|add|fond\w*|group\w*|dissol\w*|sanction\w*|p[eé]nalit\w*|waive|annul\w*)\b/i,
  account:
    /\b(compte|account|pin|num[eé]ro|number|langue|language|pr[eé]f[eé]rence\w*|preference\w*|notif\w*|profil\w*|profile|supprim\w*|delete|t[eé]l[eé]phone|phone)\b/i,
  chat: /\b(message\w*|discu\w*|chat|[eé]cri\w*|write|envoi\w*|send|annonce\w*|announce\w*|dis à|tell|summar\w*|r[eé]sum\w*|note\w*|unread|non[- ]lu\w*|read\b|lire|lu\w*|talk\w*|parl\w*|said|dit|quoi de neuf|missed|manqu\w*|rat[eé]\w*|conversation\w*)\b/i,
  meetings:
    /\b(r[eé]union\w*|meeting\w*|rendez|agenda|proc[eè]s|minutes|pv|pr[eé]sence\w*|attendance|visio|appel|call)\b/i,
};

/** The categories a message is about, plus `reading`. */
export function topicsOf(text: string): Set<string> {
  const found = new Set<string>(['reading']);
  for (const [category, pattern] of Object.entries(TOPICS)) {
    if (pattern.test(text)) found.add(category);
  }
  return found;
}

function lastUserIndex(messages: readonly LlmMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]!.role === 'user') return i;
  }
  return -1;
}

function usedToolNames(messages: readonly LlmMessage[]): Set<string> {
  const names = new Set<string>();
  for (const m of messages) {
    if (m.role === 'assistant') for (const call of m.toolCalls ?? []) names.add(call.name);
  }
  return names;
}

/** How many of its words a message has in each category: more words, more relevant. */
function topicScores(text: string): Map<string, number> {
  const scores = new Map<string, number>();
  for (const [category, pattern] of Object.entries(TOPICS)) {
    const hits = text.match(new RegExp(pattern.source, 'gi'))?.length ?? 0;
    if (hits > 0) scores.set(category, hits);
  }
  return scores;
}

/**
 * The tools that fit in `budgetTokens`, most useful first: those already used in this turn, the
 * reading tools, then the tools of the categories the message is about (the category with most
 * matching words first). A tool that no longer fits is left out; a smaller one after it may still fit.
 */
function pickTools(
  tools: readonly LlmToolSpec[],
  messages: readonly LlmMessage[],
  budgetTokens: number,
): LlmToolSpec[] {
  const at = lastUserIndex(messages);
  const last = at >= 0 ? messages[at] : undefined;
  const asked = last?.role === 'user' ? last.content : '';
  const directScores = topicScores(asked);
  // Short follow-ups ("Yes", "Oui", "Ok", "Go ahead") have no topic words of their own: look at
  // the immediately preceding exchange so the tools for what the assistant just offered stay kept.
  const recentContext =
    at > 0
      ? messages
          .slice(Math.max(0, at - 2), at + 1)
          .map((m) => m.content ?? '')
          .join(' ')
      : asked;
  const scores = directScores.size > 0 ? directScores : topicScores(recentContext);
  const used = usedToolNames(messages.slice(Math.max(0, at)));
  const rank = (tool: LlmToolSpec): number => {
    if (used.has(tool.name)) return 0;
    if (tool.category === undefined) return 1;
    if (tool.category === 'reading') return 2;
    if (tool.name === 'summarize_unread' || tool.name === 'search_chat') return 2.5;
    const score = scores.get(tool.category) ?? 0;
    return score > 0 ? 3 + 1 / (1 + score) : Number.POSITIVE_INFINITY;
  };
  const ordered = tools
    .map((tool, index) => ({ tool, index, rank: rank(tool) }))
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
  const kept: { tool: LlmToolSpec; index: number }[] = [];
  let left = budgetTokens;
  for (const entry of ordered) {
    const cost = Math.ceil(JSON.stringify(entry.tool).length / CHARS_PER_TOKEN);
    if (cost > left) continue;
    left -= cost;
    kept.push(entry);
  }
  // Back in the registry's order, so the request reads the same every time.
  return kept.sort((a, b) => a.index - b.index).map((entry) => entry.tool);
}

function trimResult(message: LlmMessage): LlmMessage {
  if (message.role !== 'tool' || message.content.length <= COMPACT_TOOL_RESULT_CHARS)
    return message;
  const closing = '</tool_result>';
  const wrapped = message.content.endsWith(closing);
  const body = wrapped ? message.content.slice(0, -closing.length) : message.content;
  // Cut inside the block and close it again: a result must stay a block the model can tell apart.
  const cut = `${body.slice(0, COMPACT_TOOL_RESULT_CHARS)} …[cut]`;
  return { ...message, content: wrapped ? `${cut}\n${closing}` : cut };
}

/** The model MUST see its own last question/statement so short follow-ups like "Yes" / "Oui"
 *  make sense. The last assistant message in `history` (before the current user turn) is pinned. */

/**
 * The last assistant message in `history` (the agent's most recent reply before this turn).
 * This is the minimum we always keep: without it, a "Yes" or "Oui" follow-up has no context.
 */
function lastAssistantInHistory(history: readonly LlmMessage[]): LlmMessage | undefined {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]!.role === 'assistant') return history[i];
  }
  return undefined;
}

/** Normal chat lines (<= 850 chars) in the last 10 history messages (5 full turns), plus always
 *  the last assistant reply, are pinned as a contiguous suffix so the model never loses context. */
const PINNED_WINDOW = 10;
const PINNED_MAX_CHARS = 850;

function pinnedHistory(history: readonly LlmMessage[]): LlmMessage[] {
  const lastAssistant = lastAssistantInHistory(history);
  const pinned: LlmMessage[] = [];
  const stop = Math.max(0, history.length - PINNED_WINDOW);
  for (let i = history.length - 1; i >= stop; i -= 1) {
    const m = history[i]!;
    if (m !== lastAssistant && (m.content ?? '').length > PINNED_MAX_CHARS) break;
    pinned.unshift(m);
  }
  if (lastAssistant && !pinned.includes(lastAssistant)) pinned.push(lastAssistant);
  return pinned;
}

/**
 * The request cut down to `maxTokens` (estimated), or unchanged when it already fits. When even
 * the smallest form does not fit, the smallest form is returned and the provider decides.
 */
export function compactRequest(request: LlmRequest, maxTokens: number): LlmRequest {
  if (estimateTokens(request) <= maxTokens) return request;
  const at = lastUserIndex(request.messages);
  const system = request.messages.filter((m) => m.role === 'system');
  const history = at >= 0 ? request.messages.slice(0, at).filter((m) => m.role !== 'system') : [];
  const current = (at >= 0 ? request.messages.slice(at) : request.messages.slice()).map(trimResult);

  // The system prompt, this turn's work, and the pinned recent exchange come first; the tools
  // take what is left, and older history takes what the tools leave.
  const pinned = pinnedHistory(history);
  const pinnedSet = new Set(pinned);
  const fixed = estimateTokens({
    messages: [...system, ...pinned, ...current],
    tools: [],
  });
  const remainingAfterFixed = Math.max(0, maxTokens - fixed);
  // When the budget is generous (> 3 500 tokens), reserve a slice for older history so tools do
  // not consume 100% of the remaining budget in long multi-turn conversations.
  const olderHistoryReserve =
    maxTokens >= 3_500 && history.length > pinned.length
      ? Math.min(600, Math.floor(remainingAfterFixed * 0.2))
      : 0;
  const tools = pickTools(
    request.tools,
    request.messages,
    Math.max(0, remainingAfterFixed - olderHistoryReserve),
  );
  const mergeHistory = (kept: readonly LlmMessage[]): LlmMessage[] => {
    const keptSet = new Set(kept);
    return history.filter((m) => keptSet.has(m) || pinnedSet.has(m));
  };
  const shaped = (kept: LlmMessage[]): LlmRequest => ({
    ...request,
    tools,
    messages: [...system, ...mergeHistory(kept), ...current],
  });

  // Add the newest history that still fits, newest first, as whole messages.
  let kept: LlmMessage[] = [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const next = [history[i]!, ...kept];
    if (estimateTokens(shaped(next)) > maxTokens) break;
    kept = next;
  }
  return shaped(kept);
}

/** True when `request` already holds work done by a provider other than `member`. */
export function isTakingOver(messages: readonly LlmMessage[], member: string): boolean {
  const at = lastUserIndex(messages);
  return messages
    .slice(Math.max(0, at))
    .some((m) => m.role === 'assistant' && m.by !== undefined && m.by !== member);
}

export const HANDOVER_NOTE = [
  '[Handover] Another assistant model began this reply and has been replaced.',
  'The tool calls and results above are its work in this turn: they are facts already fetched',
  'for this member. Do not call a tool again for something already answered there. Continue from',
  "them and answer the member's last message, with the same rules and in the member's language.",
  'Never say that a card or action is done: the member confirms in the app.',
].join(' ');

/** The system message with the handover note added at its end. */
export function withHandoverNote(messages: readonly LlmMessage[]): LlmMessage[] {
  const out = messages.slice();
  const first = out.findIndex((m) => m.role === 'system');
  if (first < 0) return [{ role: 'system', content: HANDOVER_NOTE }, ...out];
  const system = out[first] as { role: 'system'; content: string };
  out[first] = { role: 'system', content: `${system.content}\n\n${HANDOVER_NOTE}` };
  return out;
}
