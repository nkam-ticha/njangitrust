// One turn of the agent loop (spec 4.2). Database-free: the store, the session facts, the model and
// the tools are injected, so the evaluation's scripted mode runs this exact code.
//   messages = [system + session + summary, ...history, member text]
//   up to 8 steps: model -> tool calls run as ctx -> results wrapped as data -> model ...
//   final text -> output guard (streamed through it) -> stored redacted -> returned
// A turn runs inside one serverless request (60 s at most), so it has a time budget: every model
// call is cut at the per-request timeout or at what is left of the budget, whichever is shorter,
// and a turn that runs out of time ends with the same sentence as one that runs out of steps.
import type { AgentCard, AgentTraceDto } from '@njangi/shared/contracts/agent';
import { agentTexts } from '@njangi/shared/i18n/server/agent';
import { refusesWithoutTrying, verifyReply } from '../guards/claims';
import { MAX_TOOL_STEPS } from '../guards/rate-limit';
import { detectLanguage } from '../guards/language';
import { maskPhonesDeep } from '../guards/phone-guard';
import { redactForStorage, redactToolArgs } from '../guards/redaction';
import { StreamGuard } from '../guards/stream-guard';
import { wrapToolResult } from '../guards/wrap';
import { clock } from '../../lib/clock';
import { isLlmError } from '../llm/errors';
import type { LlmClient, LlmMessage, LlmResponse } from '../llm/types';
import { PROMPT_VERSION } from '../prompts';
import { buildSessionBlock, type SessionFacts } from '../session/block';
import {
  FROM_GROUP,
  readSummary,
  type Conversation,
  type ConversationStore,
  type StoredMessage,
} from '../store/types';
import { runTool, type ToolRun } from '../tools/execute';
import { toLlmTool, type ToolRegistry } from '../tools/registry';
import type { AgentCtx } from '../types';
import { HISTORY_LIMIT, historyMessages, memberMessage, systemMessage } from './messages';
import { stepNote, tryFirstNote, unsupportedClaimNote } from './notes';
import { guidePrefetch } from './prefetch';
import { notPreparedText, reconcileReply } from './reconcile';
import { routeCategories } from './routing';

/** Tool calls the runtime runs in one step, at most. */
const MAX_CALLS_PER_STEP = 5;
/** Older lines are folded into the rolling summary in batches of this size. */
export const SUMMARY_BATCH = 10;
/** A model call is not started with less time than this left in the budget. */
const MIN_STEP_MS = 3_000;
/** The rolling summary is an extra model call: only when this much of the budget is left. */
const MIN_SUMMARY_MS = 10_000;

/** Time limits of one turn (spec 4.2 limits, plus the 60 s limit of a serverless request). */
export interface TurnBudget {
  /** The whole turn: every model call and tool of the loop. */
  turnMs: number;
  /** One model call. */
  requestMs: number;
  nowMs?: () => number;
}

export const DEFAULT_BUDGET: TurnBudget = { turnMs: 40_000, requestMs: 20_000 };

/** Prefer the language of this turn over the saved app preference. Short common phrases count. */
export function replyLanguage(text: string | null, fallback: AgentCtx['lang']): AgentCtx['lang'] {
  if (!text) return fallback;
  return detectLanguage(text, fallback);
}

export interface TurnEmitter {
  delta(payload: { turnId: string; text: string; reset?: boolean }): void;
  /** Sends streamed text still held back by coalescing (realtime.ts). */
  flush?(turnId: string): void;
  activity(payload: { turnId: string; tool: string }): void;
}

export interface AuditSink {
  (entry: { action: string; target?: string; details: Record<string, unknown> }): Promise<void>;
}

export interface TurnDeps {
  llm: LlmClient;
  model: string;
  temperature: number;
  toolRouting: boolean;
  registry: ToolRegistry;
  store: ConversationStore;
  sessionFacts(ctx: AgentCtx): Promise<SessionFacts>;
  summarize(
    previous: string | null,
    lines: string[],
    lang: AgentCtx['lang'],
    signal?: AbortSignal,
  ): Promise<string | null>;
  emit: TurnEmitter;
  audit: AuditSink;
  /** Defaults to DEFAULT_BUDGET. */
  budget?: TurnBudget;
}

export interface TurnInput {
  ctx: AgentCtx;
  conversation: Conversation;
  /** The member's message; null for the follow-up of an action's result event. */
  text: string | null;
  fromGroup?: boolean;
}

export interface TurnResult {
  reply: string;
  replyMessage: StoredMessage;
  runs: ToolRun[];
  pendingActionIds: string[];
  cards: AgentCard[];
  /** Set when switch_group chose another group. */
  activeGroupId?: string | null;
  privateReply: boolean;
  confidential: boolean;
  trace: AgentTraceDto;
}

function activityName(run: { name: string }, registry: ToolRegistry): string {
  const level = registry.get(run.name)?.level;
  return level === 'L1' || level === 'L2' ? 'prepareAction' : run.name;
}

export async function runTurn(deps: TurnDeps, input: TurnInput): Promise<TurnResult> {
  const { ctx, conversation } = input;
  const budget = deps.budget ?? DEFAULT_BUDGET;
  const nowMs = budget.nowMs ?? (() => clock.nowMs());
  const startedAt = nowMs();
  const remaining = () => budget.turnMs - (nowMs() - startedAt);
  const callSignal = () =>
    AbortSignal.timeout(Math.max(1, Math.min(budget.requestMs, remaining())));
  const summary = readSummary(conversation.rollingSummary);
  const { lines, older } = await deps.store.dialogue(conversation.id, {
    limit: HISTORY_LIMIT,
    ...(summary ? { after: new Date(summary.upTo) } : {}),
  });
  const sessionBlock = buildSessionBlock(await deps.sessionFacts(ctx));
  const lastHistoryText = lines.at(-1)?.content ?? null;
  const historyLang = replyLanguage(lastHistoryText, ctx.lang);
  const responseLang = replyLanguage(input.text, historyLang);
  // The member's message as every provider receives it: numbers replaced by markers, typed PINs
  // and tokens masked. The routing call below gets this same text, never the raw one.
  const asked = input.text
    ? memberMessage(input.text, responseLang, input.fromGroup, ctx.numberSlots)
    : null;
  const messages: LlmMessage[] = [
    systemMessage(sessionBlock, summary?.text ?? null, responseLang),
    ...historyMessages(lines, ctx.lang),
    ...(asked ? [asked] : []),
  ];
  // A how-to question gets the guide to the app before the first call (runtime/prefetch.ts).
  const guide =
    input.text && ctx.channel === 'PRIVATE' && deps.registry.get('get_app_guide')
      ? guidePrefetch(input.text, responseLang)
      : null;
  if (guide) messages.push(...guide);
  const categories =
    deps.toolRouting && asked
      ? await routeCategories(deps.llm, deps.model, asked.content ?? '', callSignal())
      : undefined;
  const tools = deps.registry.toolsFor(ctx, categories).map(toLlmTool);

  const runs: ToolRun[] = [];
  const guard = new StreamGuard(ctx.ownPhones, (text) =>
    deps.emit.delta({ turnId: ctx.turnId, text }),
  );
  let reply: string | null = null;
  let privateReply = false;
  /** Which provider and model answered each call of this turn (the audit records it). */
  const answeredBy = new Set<string>();
  // The claim guard (runtime/reconcile.ts) watches private turns that answer a member's message: a
  // result-event follow-up legitimately says "done", and the group chat never prepares cards.
  const guarded = ctx.channel === 'PRIVATE' && input.text !== null;
  const guided = guide !== null;
  let corrected = false;
  /** The correction to send instead of accepting `text`, once per turn, while steps remain. */
  const correction = (text: string, step: number): string | null => {
    if (!guarded || corrected || step >= MAX_TOOL_STEPS - 1 || remaining() < MIN_STEP_MS * 2) {
      return null;
    }
    const isGuided = guided || runs.some((r) => r.name === 'get_app_guide' && r.status === 'OK');
    if (verifyReply(text, runs, { guided: isGuided }) === 'unsupported') {
      return unsupportedClaimNote(runs, responseLang);
    }
    return runs.length === 0 && !isGuided && refusesWithoutTrying(text)
      ? tryFirstNote(responseLang)
      : null;
  };
  for (let step = 0; step < MAX_TOOL_STEPS && reply === null && !privateReply; step += 1) {
    if (remaining() < MIN_STEP_MS) break;
    let res: LlmResponse;
    try {
      res = await deps.llm.chat(
        { model: deps.model, messages, tools, temperature: deps.temperature, purpose: 'turn' },
        { onDelta: (delta) => guard.push(delta), signal: callSignal() },
      );
    } catch (error) {
      // The model failed (out of time, or every provider rate-limited or down) after tools already
      // ran: keep what they prepared, store and audit it, and end the turn plainly. Throwing here
      // would lose the audit of those tools and make the member's retry prepare the same cards
      // again. With nothing done yet, the failure goes up and becomes AGENT_UNAVAILABLE.
      if (!isLlmError(error) || runs.length === 0) throw error;
      break;
    }
    answeredBy.add(res.provider ? `${res.provider}:${res.model ?? deps.model}` : deps.model);
    if (res.toolCalls.length === 0) {
      const text = guard.finish();
      const note = correction(text, step);
      if (note === null) {
        reply = text;
        break;
      }
      // The reply claims what no tool did, or refuses without trying: take the text back and give
      // the model one more step with a correction (once per turn).
      corrected = true;
      if (guard.emitted) deps.emit.delta({ turnId: ctx.turnId, text: '', reset: true });
      guard.reset();
      messages.push({ role: 'assistant', content: text }, { role: 'system', content: note });
      continue;
    }
    if (guard.emitted) deps.emit.delta({ turnId: ctx.turnId, text: '', reset: true });
    guard.reset();
    const calls = res.toolCalls.slice(0, MAX_CALLS_PER_STEP);
    messages.push({
      role: 'assistant',
      content: res.text || null,
      toolCalls: calls,
      ...(res.provider ? { by: res.provider } : {}),
    });
    for (const call of calls) {
      deps.emit.activity({ turnId: ctx.turnId, tool: activityName(call, deps.registry) });
      const run = await runTool(deps.registry, ctx, call);
      runs.push(run);
      messages.push({
        role: 'tool',
        toolCallId: call.id,
        content: wrapToolResult(call.name, run.modelData),
      });
      if (run.outcome.status === 'OK' && run.outcome.privateReply) privateReply = true;
    }
    if (!privateReply) {
      messages.push({
        role: 'system',
        content: stepNote(
          calls.map((_, i) => runs[runs.length - calls.length + i]!),
          responseLang,
        ),
      });
    }
  }
  if (reply === null && !privateReply) {
    // Spec 4.2: after 8 steps (or the time budget) without an answer. When a tool failed, the
    // member hears its real reason rather than a generic sentence.
    if (guard.emitted) deps.emit.delta({ turnId: ctx.turnId, text: '', reset: true });
    reply =
      guarded && runs.some((r) => r.outcome.status !== 'OK')
        ? notPreparedText(runs, responseLang)
        : agentTexts.turnFailed[ctx.lang];
    deps.emit.delta({ turnId: ctx.turnId, text: reply });
  } else if (reply !== null && guarded) {
    // The last check: the words must agree with the tools. The server writes the sentence when not.
    const checked = reconcileReply(reply, runs, responseLang, {
      guided: guided || runs.some((r) => r.name === 'get_app_guide' && r.status === 'OK'),
    });
    if (checked.change === 'replace' && guard.emitted) {
      deps.emit.delta({ turnId: ctx.turnId, text: '', reset: true });
    }
    if (checked.change !== null) deps.emit.delta({ turnId: ctx.turnId, text: checked.streamed });
    reply = checked.text;
  }
  deps.emit.flush?.(ctx.turnId);
  const finalReply = reply ?? '';

  const ok = runs.flatMap((r) => (r.outcome.status === 'OK' ? [r.outcome] : []));
  const confidential = ok.some((o) => o.confidential);
  const switched = ok.find((o) => o.activeGroupId !== undefined);
  const stored = await persist(deps, input, runs, finalReply, confidential);
  await auditTurn(deps, ctx, runs, stored.tools, confidential, [...answeredBy]);
  if (remaining() >= MIN_SUMMARY_MS) {
    await foldSummary(deps, conversation, older, ctx.lang, callSignal());
  }

  return {
    reply: finalReply,
    replyMessage: stored.reply,
    runs,
    pendingActionIds: ok.flatMap((o) => (o.pendingActionId ? [o.pendingActionId] : [])),
    cards: ok.flatMap((o) => (o.card ? [o.card] : [])),
    ...(switched ? { activeGroupId: switched.activeGroupId ?? null } : {}),
    privateReply,
    confidential,
    trace: {
      turnId: ctx.turnId,
      promptVersion: PROMPT_VERSION,
      sessionBlock,
      toolCalls: runs.map((r) => ({
        name: r.name,
        status: r.status,
        args: confidential ? {} : redactToolArgs(r.args),
        result: confidential ? null : maskPhonesDeep(r.modelData),
      })),
      reply: finalReply,
    },
  };
}

async function persist(
  deps: TurnDeps,
  input: TurnInput,
  runs: ToolRun[],
  reply: string,
  confidential: boolean,
): Promise<{ reply: StoredMessage; tools: StoredMessage[] }> {
  const { ctx } = input;
  const rows = [
    ...(input.text
      ? [
          {
            role: 'user' as const,
            // R11.5: a turn that prepares a secret vote keeps none of its words.
            content: confidential
              ? agentTexts.secretVoteMessage[ctx.lang]
              : redactForStorage(input.text),
            toolName: input.fromGroup ? FROM_GROUP : null,
          },
        ]
      : []),
    ...runs.map((run) => ({
      role: 'tool' as const,
      toolName: run.name,
      toolStatus: run.status,
      toolArgsRedacted: confidential ? {} : redactToolArgs(run.args),
      content:
        !confidential && run.outcome.status === 'OK' && run.outcome.pendingActionId
          ? JSON.stringify({ pendingActionId: run.outcome.pendingActionId })
          : '',
    })),
    {
      role: 'assistant' as const,
      content: confidential ? agentTexts.secretVoteReply[ctx.lang] : redactForStorage(reply),
    },
  ];
  const stored = await deps.store.append(input.conversation.id, rows);
  return { reply: stored[stored.length - 1]!, tools: stored.filter((m) => m.role === 'tool') };
}

/** Spec 4.10: every tool call with the member, the tool, redacted arguments and the status. */
async function auditTurn(
  deps: TurnDeps,
  ctx: AgentCtx,
  runs: ToolRun[],
  rows: StoredMessage[],
  confidential: boolean,
  answeredBy: string[],
): Promise<void> {
  for (const [i, run] of runs.entries()) {
    await deps.audit({
      action: 'agent.tool',
      ...(rows[i] ? { target: `AgentMessage:${rows[i].id}` } : {}),
      details: {
        tool: run.name,
        status: run.status,
        args: confidential ? {} : redactToolArgs(run.args),
      },
    });
  }
  await deps.audit({
    action: 'agent.turn',
    details: {
      promptVersion: PROMPT_VERSION,
      model: answeredBy.length > 0 ? answeredBy.join(',') : deps.model,
      channel: ctx.channel,
      toolCalls: runs.length,
    },
  });
}

/** Spec 4.3: lines older than the last 20 are folded into the rolling summary, ten at a time. */
async function foldSummary(
  deps: TurnDeps,
  conversation: Conversation,
  older: StoredMessage[],
  lang: AgentCtx['lang'],
  signal: AbortSignal,
): Promise<void> {
  if (older.length < SUMMARY_BATCH) return;
  const previous = readSummary(conversation.rollingSummary)?.text ?? null;
  const text = await deps
    .summarize(
      previous,
      older.map(
        (m) =>
          `${m.role === 'assistant' ? 'Njangi' : m.role === 'user' ? 'Member' : 'Event'}: ${m.content}`,
      ),
      lang,
      signal,
    )
    .catch(() => null);
  if (!text) return;
  const upTo = older[older.length - 1]!.createdAt.toISOString();
  const serialised = JSON.stringify({ upTo, text: redactForStorage(text) });
  await deps.store.setSummary(conversation.id, serialised);
  conversation.rollingSummary = serialised;
}
