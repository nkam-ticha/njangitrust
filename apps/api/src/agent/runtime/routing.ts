// Tool routing (spec 4.11), behind AGENT_TOOL_ROUTING (off by default): a short classification call
// picks the categories, then only their tools are sent. Reading tools are always kept (answers need
// facts, rule 1). Any doubt (bad JSON, unknown category, a failed call) sends every allowed tool.
import { neutralise } from '../guards/wrap';
import type { LlmClient, LlmRequest } from '../llm/types';
import { ROUTING_PROMPT } from '../prompts';
import { TOOL_CATEGORIES, type ToolCategory } from '../tools/types';

export function parseCategories(text: string): ToolCategory[] | null {
  const match = /\[[^\]]*\]/.exec(text);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const known = new Set<string>(TOOL_CATEGORIES);
    if (!parsed.every((c) => typeof c === 'string' && known.has(c))) return null;
    return [...new Set([...(parsed as ToolCategory[]), 'reading' as const])];
  } catch {
    return null;
  }
}

export async function routeCategories(
  llm: LlmClient,
  model: string,
  text: string,
  signal?: AbortSignal,
): Promise<ToolCategory[] | undefined> {
  try {
    const request: LlmRequest = {
      model,
      purpose: 'routing',
      temperature: 0,
      // A reasoning model thinks before it answers: 40 tokens would leave it nothing to say.
      maxTokens: 300,
      tools: [],
      messages: [
        { role: 'system', content: ROUTING_PROMPT },
        { role: 'user', content: `<message>${neutralise(text)}</message>` },
      ],
    };
    const res = await llm.chat(request, signal ? { signal } : {});
    return parseCategories(res.text) ?? undefined;
  } catch {
    return undefined;
  }
}
