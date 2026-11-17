// Assembles what the model receives on a turn (spec 4.3): the system prompt with the session block
// and the rolling summary, the last 20 lines of this member's conversation, then the new message.
// Member text, events and summaries are wrapped so none of them can pass for the server.
import type { Lang } from '@njangi/shared';
import { bilingualSchema } from '@njangi/shared/contracts/common';
import type { NumberSlots } from '../guards/number-slots';
import { neutralise, wrapEvent, wrapMemberText } from '../guards/wrap';
import type { LlmMessage } from '../llm/types';
import { systemPrompt } from '../prompts';
import { EVENT_TOOL, FROM_GROUP, type StoredMessage } from '../store/types';

export const HISTORY_LIMIT = 20;

const FROM_GROUP_NOTE: Record<Lang, string> = {
  fr: '(question posée dans le chat du groupe) ',
  en: '(question asked in the group chat) ',
};

export function systemMessage(sessionBlock: string, summary: string | null): LlmMessage {
  const parts = [systemPrompt(), sessionBlock];
  if (summary) parts.push(`<summary>\n${neutralise(summary)}\n</summary>`);
  return { role: 'system', content: parts.join('\n\n') };
}

/** An event line as stored: `{ pendingActionId, status, text: { fr, en } }`. */
export function readEvent(
  content: string,
): { pendingActionId: string; status: string; text: { fr: string; en: string } } | null {
  try {
    const parsed = JSON.parse(content) as {
      pendingActionId?: unknown;
      status?: unknown;
      text?: unknown;
    };
    const text = bilingualSchema.safeParse(parsed.text);
    if (typeof parsed.pendingActionId !== 'string' || typeof parsed.status !== 'string')
      return null;
    if (!text.success) return null;
    return { pendingActionId: parsed.pendingActionId, status: parsed.status, text: text.data };
  } catch {
    return null;
  }
}

const SLOT_NOTE: Record<Lang, string> = {
  fr: '\n(Les numéros de téléphone de ce message sont remplacés par des repères [phone-N] : passe-les tels quels à l’outil qui en a besoin, sans jamais les écrire dans ta réponse.)',
  en: '\n(Phone numbers in this message are replaced by [phone-N] markers: pass them as written to the tool that needs them, and never write them in your reply.)',
};

/**
 * The member's message for the model. Phone numbers become markers (see guards/number-slots.ts),
 * so a number typed to the agent is never sent to the provider.
 */
export function memberMessage(
  text: string,
  lang: Lang,
  fromGroup = false,
  slots?: NumberSlots,
): LlmMessage {
  const masked = slots ? slots.mask(text) : text;
  const note = slots?.used ? SLOT_NOTE[lang] : '';
  return {
    role: 'user',
    content: (fromGroup ? FROM_GROUP_NOTE[lang] : '') + wrapMemberText(masked) + note,
  };
}

export function historyMessages(lines: StoredMessage[], lang: Lang): LlmMessage[] {
  const out: LlmMessage[] = [];
  for (const line of lines) {
    if (line.role === 'user') {
      out.push(memberMessage(line.content, lang, line.toolName === FROM_GROUP));
    } else if (line.role === 'assistant') {
      out.push({ role: 'assistant', content: line.content });
    } else if (line.toolName === EVENT_TOOL) {
      const event = readEvent(line.content);
      if (event) out.push({ role: 'user', content: wrapEvent(event.status, event.text[lang]) });
    }
  }
  return out;
}
