// The evaluation's driver: it plays the app for a demo member, in this process, against the real
// agent (the same handleUserMessage the REST route calls), the real services and the development
// database with the demo data (spec 5.5). Only the model is wrapped, to record exactly what it is
// sent; in scripted mode a scripted model stands in for OpenRouter and no key is needed.
//
// It lives in the API package because it uses the API's internals; tools/agent-eval loads it and
// holds everything else (scenarios, scripted replies, checks, report).
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { registerAgentJobs } from '../index';
import { agentConfig, setAgentConfigForTests } from '../config';
import { EVENT_TOOL } from '../store/types';
import { agentMessageLimiter } from '../guards/rate-limit';
import { OpenRouterClient } from '../llm/openrouter';
import { setLlmForTests } from '../llm/provider';
import type { LlmCallOptions, LlmClient, LlmRequest, LlmResponse } from '../llm/types';
import { PROMPT_VERSION } from '../prompts';
import { handleUserMessage } from '../service/turns';
import { agentStatus } from '../status';
import { settleBackground, useJobScheduler } from '../../jobs/dispatch';
import { settlePendingWork } from '../../lib/pending-work';
import { getPrisma } from '../../lib/prisma';
import { runAsSystem } from '../../lib/request-context';
import { sendMessage } from '../../modules/chat/chat.messages';
import { listMyGroups } from '../../modules/me';
import { completePendingAction } from '../../modules/pending-actions';
import { registerActionHandlers, registerJobs } from '../../modules/register';
import * as people from '../../../../../tools/demo-seed/src/people';
import type { AgentDriver, AgentSession } from '../../../../../tools/agent-eval/src/harness';
import { scriptedAnswer } from '../../../../../tools/agent-eval/src/script';
import {
  eventsOf,
  sessionBlockOf,
  toolResultsOf,
  type SentMessage,
} from '../../../../../tools/agent-eval/src/transcript';
import {
  NotAvailable,
  type Need,
  type ScriptStep,
  type TurnEvidence,
} from '../../../../../tools/agent-eval/src/types';

export type Mode = 'scripted' | 'live';

interface Exchange {
  request: LlmRequest;
  response: LlmResponse;
}

/** The model as the agent sees it during an evaluation: scripted or real, always recorded. */
class RecordedModel implements LlmClient {
  readonly name = 'evaluation';
  exchanges: Exchange[] = [];
  private steps: readonly ScriptStep[] = [];
  private calls = 0;

  constructor(private readonly real: LlmClient | null) {}

  startTurn(steps: readonly ScriptStep[]): void {
    this.exchanges = [];
    this.steps = steps;
    this.calls = 0;
  }

  async chat(request: LlmRequest, options: LlmCallOptions = {}): Promise<LlmResponse> {
    const response = this.real
      ? await this.real.chat(request, options)
      : this.scripted(request, options);
    if (request.purpose === 'turn') this.exchanges.push({ request, response });
    return response;
  }

  private scripted(request: LlmRequest, options: LlmCallOptions): LlmResponse {
    if (request.purpose === 'routing') return { text: '[]', toolCalls: [], finishReason: 'stop' };
    if (request.purpose === 'summary') {
      const text = 'Le groupe a parl\u00e9 de la prochaine r\u00e9union.';
      return { text, toolCalls: [], finishReason: 'stop' };
    }
    const call = this.calls;
    this.calls += 1;
    const answer = scriptedAnswer(this.steps, call, request.messages);
    if (answer.text) options.onDelta?.(answer.text);
    const toolCalls = (answer.toolCalls ?? []).map((tool, i) => ({
      id: `call_${call}_${i}`,
      name: tool.name,
      arguments: JSON.stringify(tool.args),
    }));
    return {
      text: answer.text ?? '',
      toolCalls,
      finishReason: toolCalls.length ? 'tool_calls' : 'stop',
    };
  }
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The card as the server drew it: what the member will read before confirming. */
function cardText(action: PendingActionDto): string {
  return JSON.stringify(action.preview);
}

const DEMO_PEOPLE = people as unknown as Record<string, people.Person | undefined>;
const DEFAULT_GROUP = people.groups[0]!.name;

export interface EvaluationDriver extends AgentDriver {
  mode: Mode;
  model: string | null;
  promptVersion: string;
}

/**
 * Opens the driver. Scripted mode needs no key. Live mode needs OPENROUTER_API_KEY and
 * OPENROUTER_MODEL in apps/api/.env and returns null without them.
 */
export function openDriver(mode: Mode): EvaluationDriver | null {
  process.env.NJANGI_AGENT_EVAL = mode;
  let model: RecordedModel;
  let modelName: string | null;
  if (mode === 'scripted') {
    setAgentConfigForTests({ configured: true, apiKey: 'scripted', model: 'scripted' });
    model = new RecordedModel(null);
    modelName = null;
  } else {
    const config = agentConfig();
    if (!config.configured || !config.apiKey || !config.model) return null;
    model = new RecordedModel(
      new OpenRouterClient({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        timeoutMs: config.requestTimeoutMs,
      }),
    );
    modelName = config.model;
  }
  setLlmForTests(model);
  // As at server start-up; without a job scheduler, jobs run in this process.
  registerActionHandlers();
  registerJobs();
  registerAgentJobs();
  useJobScheduler(null);

  async function memberOf(key: string) {
    const person = DEMO_PEOPLE[key];
    if (!person?.phone) throw new Error(`Unknown demo member "${key}" (tools/demo-seed people)`);
    const user = await getPrisma().user.findUnique({ where: { loginPhone: person.phone } });
    if (!user) {
      throw new Error(
        `${person.name} is not in the database. Start the API and run "pnpm demo:seed" first.`,
      );
    }
    const groups = await listMyGroups(user.id);
    const group = groups.find((g) => g.group.name === DEFAULT_GROUP) ?? groups[0];
    return { person, userId: user.id, groupId: group?.group.id ?? null };
  }

  /** A fresh conversation: the evaluation's lines of this demo member are removed. */
  async function forget(userId: string): Promise<void> {
    const db = getPrisma();
    await db.agentMessage.deleteMany({ where: { conversation: { userId } } });
    await db.agentConversation.deleteMany({ where: { userId } });
    await agentMessageLimiter.get().delete(userId);
  }

  return {
    mode,
    model: modelName,
    promptVersion: PROMPT_VERSION,

    async capabilities() {
      const built = agentStatus().capabilities;
      const needs = new Set<Need>(
        (Object.keys(built) as (keyof typeof built)[]).filter((k) => built[k]),
      );
      // The demo data has chat messages once `pnpm demo:seed` has written them.
      if ((await getPrisma().message.count({ where: { kind: 'TEXT' } })) > 0) {
        needs.add('demoChat');
      }
      return needs;
    },

    async open({ member, channel, language }): Promise<AgentSession> {
      const { person, userId, groupId } = await memberOf(member);
      await forget(userId);
      if (channel === 'GROUP') {
        if (!groupId) throw new NotAvailable(`${person.name} is in no group`);
        // The member posts the message in the group chat, as the app does; the chat module calls the
        // agent (agent port), which answers in the group and may continue in private.
        return {
          ownPhones: [person.phone],
          async say(text, steps): Promise<Omit<TurnEvidence, 'index'>> {
            const db = getPrisma();
            model.startTurn(steps);
            const since = new Date(Date.now() - 1_000);
            const posted = await sendMessage(userId, groupId, { text });
            await settlePendingWork();
            await settleBackground();
            const groupMessage = await db.message.findFirst({
              where: { groupId, kind: 'AGENT', createdAt: { gte: since } },
              orderBy: { createdAt: 'desc' },
            });
            const groupText = (groupMessage?.systemText ?? null) as { fr?: string } | null;
            const privateLine = await db.agentMessage.findFirst({
              where: {
                conversation: { userId, channel: 'PRIVATE' },
                role: 'assistant',
                createdAt: { gte: since },
              },
              orderBy: { createdAt: 'desc' },
            });
            const tools = await db.agentMessage.findMany({
              where: {
                conversation: { userId },
                role: 'tool',
                toolName: { not: EVENT_TOOL },
                createdAt: { gte: since },
              },
              orderBy: { createdAt: 'asc' },
            });
            const last = model.exchanges.at(-1);
            const sent = (last?.request.messages ?? []) as SentMessage[];
            const evidence = {
              kind: 'user' as const,
              said: text,
              reply: privateLine?.content ?? '',
              groupReply: groupMessage?.text ?? groupText?.fr ?? '',
              toolCalls: tools.flatMap((row) =>
                row.toolName
                  ? [
                      {
                        name: row.toolName,
                        status: row.toolStatus ?? 'OK',
                        args: (row.toolArgsRedacted ?? {}) as Record<string, unknown>,
                      },
                    ]
                  : [],
              ),
              cards: [],
              infoCards: [],
              sessionBlock: sessionBlockOf(sent),
              toolResults: toolResultsOf(sent).map((r) => r.raw),
              events: eventsOf(sent),
            };
            // The demo group keeps no trace of the evaluation: the question and the answers go.
            await db.message.deleteMany({
              where: {
                groupId,
                OR: [{ id: posted.message.id }, { kind: 'AGENT', createdAt: { gte: since } }],
              },
            });
            return evidence;
          },
          event(): Promise<Omit<TurnEvidence, 'index'>> {
            throw new NotAvailable('result events belong to the private conversation');
          },
        };
      }
      const actor = { userId, lang: language, sessionId: 'agent-eval', client: 'mobile' as const };
      return {
        ownPhones: [person.phone],
        async say(text, steps): Promise<Omit<TurnEvidence, 'index'>> {
          model.startTurn(steps);
          const turn = await runAsSystem(() => handleUserMessage(actor, { text, groupId }));
          const last = model.exchanges.at(-1);
          const sent = (last?.request.messages ?? []) as SentMessage[];
          const asked = model.exchanges.flatMap((e) => e.response.toolCalls);
          return {
            kind: 'user',
            said: text,
            reply: turn.reply.text,
            groupReply: null,
            toolCalls: turn.toolCalls.map((call, i) => ({
              name: call.name,
              status: call.status,
              args: parseArgs(asked[i]?.name === call.name ? asked[i].arguments : '{}'),
            })),
            cards: turn.actions.map(cardText),
            infoCards: turn.cards.map((card) => card.type),
            sessionBlock: sessionBlockOf(sent),
            toolResults: toolResultsOf(sent).map((r) => r.raw),
            events: eventsOf(sent),
          };
        },
        async event(status, steps): Promise<Omit<TurnEvidence, 'index'>> {
          // The card the agent prepared in the turn before. The result is written through the same
          // service the payment code uses (completePendingAction), which announces it and queues
          // the agent's follow-up. No money moves: the scenario runs three times on one demo
          // member, and a real payment could happen once.
          const prepared = await getPrisma().pendingAction.findFirst({
            where: { userId, origin: 'AGENT', status: 'PENDING' },
            orderBy: { createdAt: 'desc' },
          });
          if (!prepared) throw new NotAvailable('the turn before did not prepare a card');
          await getPrisma().pendingAction.update({
            where: { id: prepared.id },
            data: { status: 'CONFIRMED', confirmedAt: new Date() },
          });
          model.startTurn(steps);
          await completePendingAction(
            prepared.id,
            status === 'DONE'
              ? {
                  status: 'DONE',
                  resultRef: null,
                  summary: { fr: 'Payé, réf. MP2611EVAL', en: 'Paid, ref. MP2611EVAL' },
                }
              : {
                  status: 'FAILED',
                  failureCode: 'PAYMENT_FAILED',
                  failureText: {
                    fr: 'L’opérateur a refusé le paiement. Rien n’a été débité.',
                    en: 'The operator refused the payment. Nothing was charged.',
                  },
                },
          );
          // The follow-up is queued after the announcement, then runs as a job.
          await settlePendingWork();
          await settleBackground();
          const last = model.exchanges.at(-1);
          const sent = (last?.request.messages ?? []) as SentMessage[];
          const reply = await getPrisma().agentMessage.findFirst({
            where: { conversation: { userId, channel: 'PRIVATE' }, role: 'assistant' },
            orderBy: { createdAt: 'desc' },
          });
          return {
            kind: 'event',
            said: '',
            reply: reply?.content ?? '',
            groupReply: null,
            toolCalls: [],
            cards: [],
            infoCards: [],
            sessionBlock: sessionBlockOf(sent),
            toolResults: toolResultsOf(sent).map((r) => r.raw),
            events: eventsOf(sent),
          };
        },
      };
    },

    async close() {
      setLlmForTests(null);
      await getPrisma().$disconnect();
    },
  };
}
