// The tool registry (spec 4.6, 4.8 point 1). `toolsFor(ctx)` sends the model only the tools the
// member's role and the channel allow: admin-only and private-only tools are not even described to
// it otherwise. There is no tool that confirms a PendingAction, runs a query or reads raw rows.
import { z } from 'zod';
import type { LlmToolSpec } from '../llm/types';
import type { AgentCtx } from '../types';
import type { Tool, ToolCategory, ToolSpec } from './types';

/** Spec 4.6 levels describe the tool; this note tells the model what preparing means. */
const ACTION_NOTE =
  ' Prepares a confirmation card only: nothing happens until the member confirms it in the app.';

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  constructor(tools: readonly Tool[] = []) {
    for (const tool of tools) this.add(tool);
  }

  add(tool: Tool): void {
    if (!/^[a-z][a-z_]{2,40}$/.test(tool.name)) throw new Error(`Invalid tool name ${tool.name}`);
    if (this.tools.has(tool.name)) throw new Error(`Tool ${tool.name} is registered twice`);
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  all(): Tool[] {
    return [...this.tools.values()];
  }

  /** May this member use this tool here? Checked again when the model calls it. */
  allows(ctx: Pick<AgentCtx, 'channel' | 'role'>, tool: ToolSpec): boolean {
    if (!tool.channels.includes(ctx.channel)) return false;
    if (tool.who === 'admin' && ctx.role !== 'ADMIN') return false;
    return true;
  }

  toolsFor(ctx: Pick<AgentCtx, 'channel' | 'role'>, categories?: readonly ToolCategory[]): Tool[] {
    return this.all().filter(
      (tool) => this.allows(ctx, tool) && (!categories || categories.includes(tool.category)),
    );
  }
}

/** The JSON Schema of a tool's arguments, as the provider expects it. */
export function argumentsSchema(spec: ToolSpec): Record<string, unknown> {
  const schema = z.toJSONSchema(spec.args, { io: 'input', unrepresentable: 'any' }) as Record<
    string,
    unknown
  >;
  const { $schema: _ignored, ...rest } = schema;
  return rest;
}

const schemaCache = new WeakMap<ToolSpec, LlmToolSpec>();

export function toLlmTool(spec: ToolSpec): LlmToolSpec {
  let cached = schemaCache.get(spec);
  if (!cached) {
    cached = {
      name: spec.name,
      description: spec.level === 'L0' ? spec.description : spec.description + ACTION_NOTE,
      parameters: argumentsSchema(spec),
      category: spec.category,
    };
    schemaCache.set(spec, cached);
  }
  return cached;
}
