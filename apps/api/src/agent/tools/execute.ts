// runTool (spec 4.2): zod check -> permission (role and channel, again) -> the tool's service call
// -> allowlist mapper. The acting member is always `ctx`; arguments never choose it. Refusals from
// the services become data the model explains (rule 7); unexpected errors are logged by name only.
import type { Lang } from '@njangi/shared';
import { z } from 'zod';
import { isAppError } from '../../lib/errors';
import { componentLogger } from '../../lib/logger';
import { unavailable } from './outcomes';
import type { ToolRegistry } from './registry';
import type { ToolOutcome } from './types';
import type { AgentCtx } from '../types';
import type { LlmToolCall } from '../llm/types';

const log = componentLogger('agent');

export type ToolCallStatus = 'OK' | 'REFUSED' | 'INVALID' | 'ERROR';

export interface ToolRun {
  callId: string;
  name: string;
  status: ToolCallStatus;
  outcome: ToolOutcome;
  /** The validated arguments ({} when invalid). Redacted before being stored. */
  args: Record<string, unknown>;
  /** What the model receives, before wrapping. */
  modelData: unknown;
}

/** Service refusals that mean "this part of the app is not built yet". */
const UNAVAILABLE_CODES: Record<string, 'money' | 'cycles'> = {
  PROPOSAL_TYPE_UNAVAILABLE: 'money',
  CYCLE_START_UNAVAILABLE: 'cycles',
};

const ERROR_TEXT: Record<Lang, string> = {
  fr: 'Le service n’a pas répondu. Réessaie un peu plus tard.',
  en: 'The service did not answer. Try again a little later.',
};

/**
 * What the model should do next after some refusals, in a plain sentence it can follow (it is data,
 * like the reason itself). Only codes where another tool of the catalogue does the job.
 */
const NEXT_STEP: Record<string, string> = {
  PROPOSALS_BEFORE_FIRST_CYCLE:
    'Before the first cycle there are no votes. To bring in a founding member the admin uses create_invite (a card; only the admin can). Offer that, or tell a member to ask the admin.',
};

const NUMBER_HINT =
  'A phone number can only be read in the message where the member typed it. Ask the member to type the number again in their next message, then call the tool in that same turn.';

const PHONE_MARKER = /\[phone-\d{1,2}\]/;

/** Paths of arguments that still hold a [phone-N] marker after the real numbers were put back. */
function unresolvedMarkers(value: unknown, path: string[] = []): string[] {
  if (typeof value === 'string')
    return PHONE_MARKER.test(value) ? [path.join('.') || '(arguments)'] : [];
  if (Array.isArray(value))
    return value.flatMap((v, i) => unresolvedMarkers(v, [...path, String(i)]));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => unresolvedMarkers(v, [...path, k]));
  }
  return [];
}

function zodIssues(error: z.ZodError): { path: string; code: string }[] {
  return error.issues.slice(0, 10).map((issue) => ({
    path: issue.path.map(String).join('.') || '(arguments)',
    code: /^[A-Z][A-Z0-9_]+$/.test(issue.message) ? issue.message : issue.code.toUpperCase(),
  }));
}

function statusOf(outcome: ToolOutcome): ToolCallStatus {
  if (outcome.status === 'OK') return 'OK';
  if (outcome.status === 'REFUSED' || outcome.status === 'UNAVAILABLE') return 'REFUSED';
  return outcome.status;
}

/** The data the model reads for an outcome. */
export function modelDataOf(outcome: ToolOutcome, lang: Lang): unknown {
  switch (outcome.status) {
    case 'OK':
      return outcome.data && typeof outcome.data === 'object' && !Array.isArray(outcome.data)
        ? { status: 'OK', ...outcome.data }
        : { status: 'OK', data: outcome.data };
    case 'REFUSED':
      return { status: 'REFUSED', code: outcome.code, reason: outcome.message, ...outcome.details };
    case 'UNAVAILABLE':
      return { status: 'UNAVAILABLE', message: outcome.message };
    case 'INVALID':
      return {
        status: 'INVALID',
        issues: outcome.issues,
        ...(outcome.issues.some((i) => i.code === 'NUMBER_NOT_IN_THIS_MESSAGE')
          ? { hint: NUMBER_HINT }
          : {}),
      };
    case 'ERROR':
      return { status: 'ERROR', message: ERROR_TEXT[lang] };
  }
}

function fromError(error: unknown, ctx: AgentCtx, tool: string): ToolOutcome {
  if (isAppError(error)) {
    const capability = UNAVAILABLE_CODES[error.code];
    if (capability) return unavailable(capability, ctx.lang);
    const issues = (error.details as { issues?: { path: string; code: string }[] } | undefined)
      ?.issues;
    if (error.code === 'VALIDATION_FAILED' && issues) return { status: 'INVALID', issues };
    const nextStep = NEXT_STEP[error.code];
    const details = {
      ...(error.details && !issues ? (error.details as Record<string, unknown>) : {}),
      ...(nextStep ? { nextStep } : {}),
    };
    return {
      status: 'REFUSED',
      code: error.code,
      message: error.text[ctx.lang],
      ...(Object.keys(details).length > 0 ? { details } : {}),
    };
  }
  if (error instanceof z.ZodError) return { status: 'INVALID', issues: zodIssues(error) };
  log.error({ tool, errorName: error instanceof Error ? error.name : 'unknown' }, 'tool failed');
  return { status: 'ERROR' };
}

export async function runTool(
  registry: ToolRegistry,
  ctx: AgentCtx,
  call: LlmToolCall,
): Promise<ToolRun> {
  const tool = registry.get(call.name);
  const done = (outcome: ToolOutcome, args: Record<string, unknown> = {}): ToolRun => ({
    callId: call.id,
    name: call.name,
    status: statusOf(outcome),
    outcome,
    args,
    modelData: modelDataOf(outcome, ctx.lang),
  });
  // An unknown tool, or one this member may not use here, looks the same: it does not exist.
  if (!tool || !registry.allows(ctx, tool)) {
    return done({ status: 'INVALID', issues: [{ path: '(tool)', code: 'UNKNOWN_TOOL' }] });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(call.arguments || '{}');
  } catch {
    return done({ status: 'INVALID', issues: [{ path: '(arguments)', code: 'BAD_JSON' }] });
  }
  // A number the member typed reaches the tool by its marker only: put the real number back here.
  const resolved = ctx.numberSlots ? ctx.numberSlots.resolve(raw) : raw;
  // A marker that survives is a number typed in an earlier turn: it cannot be read now. Say so,
  // rather than let the tool fail on a malformed number the model cannot explain.
  const stale = unresolvedMarkers(resolved);
  if (stale.length > 0) {
    return done({
      status: 'INVALID',
      issues: stale.map((path) => ({ path, code: 'NUMBER_NOT_IN_THIS_MESSAGE' })),
    });
  }
  const parsed = tool.args.safeParse(resolved);
  if (!parsed.success) return done({ status: 'INVALID', issues: zodIssues(parsed.error) });
  try {
    return done(await tool.run(ctx, parsed.data), parsed.data);
  } catch (error) {
    return done(fromError(error, ctx, tool.name), parsed.data);
  }
}
