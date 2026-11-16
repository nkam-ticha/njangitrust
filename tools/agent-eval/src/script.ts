// The scripted model of `--scripted` mode. It answers with the scenario's steps, and it never
// invents a fact: every {{placeholder}} of a scripted reply is filled from what the server really
// sent in this turn (tool results, the result event, the confirmation card's summary). When the
// server did not send the fact, the reply cannot be built and the run fails, naming what is missing.
import { eventsOf, toolResultsOf, type SentMessage, type SentToolResult } from './transcript';
import type { ScriptStep } from './types';

export class ScriptError extends Error {
  override name = 'ScriptError';
}

export interface ScriptedAnswer {
  text?: string;
  toolCalls?: { name: string; args: Record<string, unknown> }[];
}

const AMOUNT = /\d{1,3}(?:[\s\u00a0\u202f,]\d{3})*[\s\u00a0\u202f]?FCFA/;
const PLACEHOLDER = /\{\{([a-z]+)(?::([A-Za-z_]+))?\}\}/g;

/** The first value found under `key`, anywhere in `value`. */
function find(value: unknown, key: string): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = find(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record[key] !== undefined && record[key] !== null) return record[key];
    for (const inner of Object.values(record)) {
      const found = find(inner, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function names(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === 'string') return [item];
    const name = (item as { name?: unknown } | null)?.name;
    return typeof name === 'string' ? [name] : [];
  });
}

function resolve(kind: string, key: string | undefined, messages: readonly SentMessage[]): string {
  const results: SentToolResult[] = toolResultsOf(messages);
  const data = results.map((r) => r.data);
  const missing = (what: string): never => {
    throw new ScriptError(`the server sent no ${what} for {{${kind}${key ? `:${key}` : ''}}}`);
  };
  switch (kind) {
    case 'amount': {
      const value = key ? find(data, key) : undefined;
      if (typeof value === 'string' && AMOUNT.test(value)) return AMOUNT.exec(value)![0];
      return missing('formatted amount');
    }
    case 'date': {
      const value = key ? find(data, key) : undefined;
      return typeof value === 'string' && value.trim() ? value : missing('date');
    }
    case 'names': {
      const list = names(key ? find(data, key) : undefined);
      return list.length ? list.join(', ') : missing('list of names');
    }
    case 'summary': {
      const value = find(data, 'summary');
      return typeof value === 'string' && value.trim() ? value : missing('summary');
    }
    case 'card': {
      const card = [...data]
        .reverse()
        .find(
          (d) => typeof (d as { pendingActionId?: unknown } | null)?.pendingActionId === 'string',
        );
      const value = (card as { summary?: unknown } | undefined)?.summary;
      return typeof value === 'string' && value.trim() ? value : missing('confirmation card');
    }
    case 'event': {
      const event = eventsOf(messages).at(-1);
      return event ? event.text : missing('result event');
    }
    case 'proposal': {
      const all = data.flatMap((d) => {
        const list = find(d, 'proposals');
        return Array.isArray(list) ? (list as { id?: unknown; type?: unknown }[]) : [];
      });
      const match = all.find((p) => p.type === key);
      return typeof match?.id === 'string' ? match.id : missing(`open ${key ?? ''} proposal`);
    }
    default:
      throw new ScriptError(`unknown placeholder {{${kind}}}`);
  }
}

function fill(value: unknown, messages: readonly SentMessage[]): unknown {
  if (typeof value === 'string') {
    return value.replace(PLACEHOLDER, (_all, kind: string, key?: string) =>
      resolve(kind, key, messages),
    );
  }
  if (Array.isArray(value)) return value.map((item) => fill(item, messages));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, fill(v, messages)] as const),
    );
  }
  return value;
}

/** The scripted model's answer to its `call`-th request of a turn. */
export function scriptedAnswer(
  steps: readonly ScriptStep[],
  call: number,
  messages: readonly SentMessage[],
): ScriptedAnswer {
  const step = steps[call];
  if (!step) throw new ScriptError(`the script has no step ${call + 1} for this turn`);
  if (step.tools) {
    return {
      toolCalls: step.tools.map((tool) => ({
        name: tool.name,
        args: fill(tool.args ?? {}, messages) as Record<string, unknown>,
      })),
    };
  }
  return { text: fill(step.reply ?? '', messages) as string };
}
