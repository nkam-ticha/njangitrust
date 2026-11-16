// Reads what the model was given from the recorded requests: the session block, the tool results
// and the result events, exactly as they were sent (agent/guards/wrap.ts defines the blocks).

export interface SentMessage {
  role: string;
  content: string | null;
}

const SESSION = /<session>[\s\S]*?<\/session>/;
const TOOL_RESULT = /^<tool_result name="([a-z_]*)">\n([\s\S]*)\n<\/tool_result>$/;
const EVENT = /^<event type="action_result" status="([A-Z]+)">([\s\S]*)<\/event>$/;

export function sessionBlockOf(messages: readonly SentMessage[]): string {
  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  return SESSION.exec(system)?.[0] ?? '';
}

function parse(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

export interface SentToolResult {
  name: string;
  raw: string;
  data: unknown;
}

/** Tool results after the last member or event message: those of the turn in progress. */
export function toolResultsOf(messages: readonly SentMessage[]): SentToolResult[] {
  const out: SentToolResult[] = [];
  for (const message of messages) {
    if (message.role === 'user') out.length = 0;
    if (message.role !== 'tool' || !message.content) continue;
    const match = TOOL_RESULT.exec(message.content);
    if (!match) continue;
    out.push({ name: match[1]!, raw: match[2]!, data: parse(match[2]!) });
  }
  return out;
}

export function eventsOf(messages: readonly SentMessage[]): { status: string; text: string }[] {
  return messages.flatMap((m) => {
    const match = m.role === 'user' && m.content ? EVENT.exec(m.content) : null;
    return match ? [{ status: match[1]!, text: match[2]! }] : [];
  });
}
