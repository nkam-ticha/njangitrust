// Tool definitions (spec 4.6). A spec (name, level, who, channels, zod arguments) is pure and lives
// in tools/specs; the implementation (`run`) lives in the module that owns the service, in
// `<area>.tools.ts`, and only validates, calls the service and maps through an allowlist mapper.
import type { AgentCard, AgentChannel } from '@njangi/shared/contracts/agent';
import type { AgentCapability } from '@njangi/shared/i18n/server/agent';
import type { z } from 'zod';
import type { AgentCtx } from '../types';

export type ToolLevel = 'L0' | 'L1' | 'L2';
export type ToolCategory =
  'reading' | 'payments' | 'loans' | 'governance' | 'meetings' | 'chat' | 'account';
export const TOOL_CATEGORIES: readonly ToolCategory[] = [
  'reading',
  'payments',
  'loans',
  'governance',
  'meetings',
  'chat',
  'account',
];

export type ToolArgs = z.ZodType<Record<string, unknown>>;

export interface ToolSpec<S extends ToolArgs = ToolArgs> {
  name: string;
  category: ToolCategory;
  /** L0 acts at once; L1 prepares a card (one tap); L2 a card and the PIN (spec 4.5). */
  level: ToolLevel;
  /** `admin`: sent to the model only when the member is the active group's admin. */
  who: 'member' | 'admin';
  /** GROUP: also offered when the agent is called with @njangi in the group chat (4.4). */
  channels: readonly AgentChannel[];
  /** What the model reads to choose the tool. */
  description: string;
  /** Strict: unknown keys (an actor id, a member id to act as) are refused. */
  args: S;
  /** Valid arguments, used by tests and the documentation. */
  example: z.input<S>;
  /** The part of the app this tool needs, when it is not built yet everywhere. */
  needs?: AgentCapability;
}

export type ToolOutcome =
  | {
      status: 'OK';
      /** What the model receives: minimal, allowlisted, already formatted for the member. */
      data: unknown;
      /** Set by L1/L2 tools: the card the app draws (the model gets the id and a summary). */
      pendingActionId?: string;
      card?: AgentCard;
      /** A secret vote: the turn's text and arguments are never stored (R11.5). */
      confidential?: boolean;
      /** switch_group: the new active group. */
      activeGroupId?: string | null;
      /** reply_privately (group channel): continue in the private conversation. */
      privateReply?: boolean;
    }
  | { status: 'REFUSED'; code: string; message: string; details?: Record<string, unknown> }
  | { status: 'UNAVAILABLE'; capability: AgentCapability; message: string }
  | { status: 'INVALID'; issues: { path: string; code: string }[] }
  | { status: 'ERROR' };

export interface Tool<S extends ToolArgs = ToolArgs> extends ToolSpec<S> {
  run(ctx: AgentCtx, args: z.output<S>): Promise<ToolOutcome>;
}

export function defineSpec<S extends ToolArgs>(spec: ToolSpec<S>): ToolSpec<S> {
  return spec;
}

/** Binds a spec to its implementation (in the module's `<area>.tools.ts`). */
export function implement<S extends ToolArgs>(
  spec: ToolSpec<S>,
  run: (ctx: AgentCtx, args: z.output<S>) => Promise<ToolOutcome>,
): Tool {
  return { ...spec, run };
}
