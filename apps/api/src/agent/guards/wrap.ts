// Prompt-injection defences (spec 4.8 point 6, system prompt rule 6): everything that did not come
// from the server is data. Tool results, summaries and events go to the model inside blocks that
// their content cannot close or imitate; a member's text cannot fake one of these blocks either.
import { maskPhonesDeep } from './phone-guard';

/** A PIN or code the member typed next to the word for it: `mon PIN est 123456`. */
const TYPED_SECRET =
  /\b(pin|code(?:\s+secret)?|mot\s+de\s+passe|password|passcode)\b([^\d\n]{0,24})\d{4,8}(?!\d)/giu;

/**
 * Rule 11: a PIN never leaves the server. A member may type theirs to the agent by mistake; the
 * digits are masked before the text goes to the model or to storage.
 */
export function maskTypedSecrets(text: string): string {
  return text.replace(TYPED_SECRET, (_m, word: string, between: string) => `${word}${between}••••`);
}

/** Block names the server reserves; the system prompt explains them. */
const RESERVED =
  /<\s*\/?\s*(session|summary|tool_result|event|data|message|system|instructions?)\b[^>]*>/gi;
/** "SYSTEM:", "assistant:" at the start of a line, a common way to fake a new speaker. */
const ROLE_PREFIX = /(^|\n)(\s*)(system|assistant|developer|user)\s*:/gi;

/** Neutralises reserved blocks and fake speaker prefixes in untrusted text. */
export function neutralise(text: string): string {
  return text
    .replace(RESERVED, (tag) => tag.replace(/</g, '‹').replace(/>/g, '›'))
    .replace(ROLE_PREFIX, (_m, start: string, space: string, role: string) => {
      return `${start}${space}${role}\u200a:`;
    });
}

function neutraliseDeep(value: unknown): unknown {
  if (typeof value === 'string') return neutralise(value);
  if (Array.isArray(value)) return value.map(neutraliseDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, neutraliseDeep(v)]));
  }
  return value;
}

/**
 * A tool result as the model receives it: phone numbers masked (defence in depth: services already
 * never return them), reserved blocks neutralised, inside a <tool_result> block.
 */
export function wrapToolResult(tool: string, result: unknown): string {
  const safe = neutraliseDeep(maskPhonesDeep(result));
  return `<tool_result name="${tool.replace(/[^a-z_]/g, '')}">\n${JSON.stringify(safe)}\n</tool_result>`;
}

/** The member's own message: their typed numbers stay (they may be the subject), blocks don't. */
export function wrapMemberText(text: string): string {
  return neutralise(maskTypedSecrets(text));
}

/** An action result written by the server (spec 4.5 step 5). */
export function wrapEvent(status: string, text: string): string {
  return `<event type="action_result" status="${status}">${neutralise(text)}</event>`;
}

/** Data handed to a summarisation call. */
export function wrapData(lines: string[]): string {
  return `<data>\n${lines.map(neutralise).join('\n')}\n</data>`;
}
