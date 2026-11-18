// The guide to the app, handed to the model before its first call when the member asks how or
// where or what something is (knowledge/app-guide.ts). It is added as if the model had called
// get_app_guide itself: an assistant tool call and its result, so every provider reads it the way
// it reads any tool result, and a model that would have answered from memory, or worse prepared a
// card for a question, answers from the official text instead. It saves a round trip too.
// The guide holds no amount, date or number, and its result is wrapped like any other as data.
import type { Lang } from '@njangi/shared';
import { wrapToolResult } from '../guards/wrap';
import { howToTopic } from '../knowledge/app-guide';
import type { LlmMessage } from '../llm/types';

export const PREFETCH_CALL_ID = 'prefetch_app_guide';

/** The two messages to add after the member's message, or null when it is not a how-to question. */
export function guidePrefetch(text: string, lang: Lang): LlmMessage[] | null {
  const entry = howToTopic(text);
  if (!entry) return null;
  return [
    {
      role: 'assistant',
      content: null,
      toolCalls: [
        {
          id: PREFETCH_CALL_ID,
          name: 'get_app_guide',
          arguments: JSON.stringify({ topic: entry.id }),
        },
      ],
    },
    {
      role: 'tool',
      toolCallId: PREFETCH_CALL_ID,
      content: wrapToolResult('get_app_guide', {
        topic: entry.id,
        title: entry.title[lang],
        guide: entry.text[lang],
      }),
    },
  ];
}
