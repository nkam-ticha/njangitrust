// The exact chat-completions request body sent to the provider (OpenAI-compatible, OpenRouter).
// Shared by both clients so the privacy tests scan precisely what leaves the server (spec 4.3).
import type { LlmMessage, LlmRequest } from './types';

export interface ChatBody {
  model: string;
  messages: Record<string, unknown>[];
  tools?: { type: 'function'; function: Record<string, unknown> }[];
  tool_choice?: 'auto';
  temperature: number;
  max_tokens?: number;
  stream: true;
}

function toWire(message: LlmMessage): Record<string, unknown> {
  switch (message.role) {
    case 'system':
    case 'user':
      return { role: message.role, content: message.content };
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content ?? '',
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: call.arguments },
              })),
            }
          : {}),
      };
    case 'tool':
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
  }
}

export function toChatBody(request: LlmRequest): ChatBody {
  return {
    model: request.model,
    messages: request.messages.map(toWire),
    ...(request.tools.length
      ? {
          tools: request.tools.map((tool) => ({
            type: 'function' as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })),
          tool_choice: 'auto' as const,
        }
      : {}),
    temperature: request.temperature,
    ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
    stream: true,
  };
}
