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

/** Differences between providers in how a request is written. */
export interface WireFlavor {
  /**
   * Google AI Studio (Gemini 3) refuses a replayed function call without its thought signature.
   * A call made by another model has none: Google documents this placeholder for that case.
   */
  googleSignatures?: boolean;
}

export const GOOGLE_SKIP_SIGNATURE = 'skip_thought_signature_validator';

function toWire(message: LlmMessage, flavor: WireFlavor): Record<string, unknown> {
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
                ...(flavor.googleSignatures
                  ? {
                      extra_content: {
                        google: { thought_signature: call.signature ?? GOOGLE_SKIP_SIGNATURE },
                      },
                    }
                  : {}),
              })),
            }
          : {}),
      };
    case 'tool':
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
  }
}

export function toChatBody(request: LlmRequest, flavor: WireFlavor = {}): ChatBody {
  return {
    model: request.model,
    messages: request.messages.map((message) => toWire(message, flavor)),
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
