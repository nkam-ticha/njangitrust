// The agent Njangi (spec 2.7 Agent, 2.8, 4.2 to 4.10). The member talks to the agent in the
// private conversation; the app draws every confirmation card from the server's PendingAction
// (contracts/pending-actions), never from the agent's text.
import { z } from 'zod';
import { bilingualSchema, instantSchema, languageSchema, uuidSchema } from './common';
import { pendingActionSchema } from './pending-actions';

export const agentChannelSchema = z.enum(['PRIVATE', 'GROUP']);
export type AgentChannel = z.infer<typeof agentChannelSchema>;

/** Composer limit (designer copy agent.composer.tooLong). */
export const AGENT_MESSAGE_MAX = 1_000;

// Control characters (except tab and newline) are never accepted.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/**
 * What the member types to the agent. Unlike group-visible text it may contain a phone number
 * (their own new payment number, an invitee's number): it is redacted before it is stored or
 * logged (spec 4.8 point 7) and never shown to anyone else.
 */
export const agentTextSchema = z
  .string()
  .transform((v) => v.normalize('NFKC').trim())
  .pipe(z.string().min(1).max(AGENT_MESSAGE_MAX))
  .refine((v) => !CONTROL_CHARS.test(v), 'INVALID_TEXT');

/** POST /v1/agent/messages. `groupId`: the member's active group in the app (null: none yet). */
export const agentMessageRequestSchema = z.strictObject({
  text: agentTextSchema,
  groupId: uuidSchema.nullable().optional(),
});
export type AgentMessageRequest = z.infer<typeof agentMessageRequestSchema>;

/** Information cards the app draws from the server (spec 4.5): sensitive values stay out of the AI. */
export const agentCardSchema = z.discriminatedUnion('type', [
  /** The member's own full payment number: the app reads it from GET /v1/me. */
  z.strictObject({ type: z.literal('PAYMENT_NUMBER') }),
  z.strictObject({ type: z.literal('STATEMENT'), statementId: uuidSchema }),
  z.strictObject({
    type: z.literal('LEDGER_EXPORT'),
    groupId: uuidSchema,
    format: z.enum(['json', 'csv']),
  }),
  z.strictObject({ type: z.literal('MINUTES_DRAFT'), meetingId: uuidSchema }),
]);
export type AgentCard = z.infer<typeof agentCardSchema>;

export const agentMessageRoleSchema = z.enum(['user', 'assistant', 'event']);

/** One line of the conversation. `event`: an action's result, written by the server (4.5 step 5). */
export const agentMessageSchema = z.strictObject({
  id: uuidSchema,
  role: agentMessageRoleSchema,
  text: z.string(),
  /** Set on `user` lines that came from an @njangi question in the group chat (4.4). */
  fromGroup: z.boolean(),
  event: z
    .strictObject({
      pendingActionId: uuidSchema,
      status: z.enum(['DONE', 'FAILED', 'CANCELLED', 'EXPIRED']),
    })
    .nullable(),
  createdAt: instantSchema,
});
export type AgentMessageDto = z.infer<typeof agentMessageSchema>;

export const toolCallStatusSchema = z.enum(['OK', 'REFUSED', 'INVALID', 'ERROR']);

/** The reply to a member's message, also sent as `agent.done`. */
export const agentTurnSchema = z.strictObject({
  id: z.string(),
  conversationId: uuidSchema,
  reply: agentMessageSchema,
  /** Cards to confirm, drawn from the server's PendingAction. */
  actions: z.array(pendingActionSchema),
  cards: z.array(agentCardSchema),
  toolCalls: z.array(z.strictObject({ name: z.string(), status: toolCallStatusSchema })),
  /** The active group after this turn (switch_group changes it). */
  activeGroupId: uuidSchema.nullable(),
  language: languageSchema,
});
export type AgentTurnDto = z.infer<typeof agentTurnSchema>;
export const agentTurnResponseSchema = z.strictObject({ turn: agentTurnSchema });

export const agentConversationSchema = z.strictObject({
  conversation: z
    .strictObject({ id: uuidSchema, groupId: uuidSchema.nullable(), channel: agentChannelSchema })
    .nullable(),
  messages: z.array(agentMessageSchema),
  nextBefore: instantSchema.nullable(),
});
export type AgentConversationDto = z.infer<typeof agentConversationSchema>;

export const agentListQuerySchema = z.strictObject({
  before: instantSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** "Historique de l'assistant" (4.10): what the agent looked at, prepared or did for the member. */
export const agentHistoryItemSchema = z.strictObject({
  id: uuidSchema,
  /** Tool name; the app labels it with agentHistory.tools.<name>. */
  tool: z.string(),
  status: z.enum([
    'looked',
    'prepared',
    'confirmed',
    'done',
    'cancelled',
    'expired',
    'failed',
    'refused',
  ]),
  pendingActionId: uuidSchema.nullable(),
  createdAt: instantSchema,
});
export type AgentHistoryItemDto = z.infer<typeof agentHistoryItemSchema>;
export const agentHistorySchema = z.strictObject({
  items: z.array(agentHistoryItemSchema),
  nextBefore: instantSchema.nullable(),
});

/** GET /v1/agent/status. `capabilities`: which parts of the app the agent can reach today. */
export const agentStatusSchema = z.strictObject({
  configured: z.boolean(),
  /** Shown instead of the composer when the agent is not configured. */
  message: bilingualSchema.nullable(),
  toolRouting: z.boolean(),
  capabilities: z.strictObject({
    money: z.boolean(),
    cycles: z.boolean(),
    chat: z.boolean(),
    meetings: z.boolean(),
    statements: z.boolean(),
    account: z.boolean(),
  }),
});
export type AgentStatusDto = z.infer<typeof agentStatusSchema>;

/**
 * What the model was given in one turn (session block, tool results as sent). Kept by the runtime's
 * result for tests and the evaluation (5.4); no route returns it.
 */
export const agentTraceSchema = z.strictObject({
  turnId: z.string(),
  promptVersion: z.string(),
  sessionBlock: z.string(),
  toolCalls: z.array(
    z.strictObject({
      name: z.string(),
      status: toolCallStatusSchema,
      args: z.unknown(),
      result: z.unknown(),
    }),
  ),
  reply: z.string(),
});
export type AgentTraceDto = z.infer<typeof agentTraceSchema>;

/**
 * `agent.delta`: streamed reply text. `reset`: drop what was streamed for this turn so far. `seq`
 * counts the deltas of a turn from 0: broadcasts are separate deliveries, so the app applies them
 * in `seq` order. The complete reply always comes with the HTTP response and `agent.done`.
 */
export interface AgentDeltaPayload {
  turnId: string;
  seq: number;
  text: string;
  reset?: boolean;
}

/** `agent.activity`: what the agent is doing (designer copy agent.activity.<tool>). */
export interface AgentActivityPayload {
  turnId: string;
  tool: string;
}

/** `agent.done`: the final reply of a turn, or an action's result event. */
export type AgentDonePayload = AgentTurnDto;

/** The agent's events in the member's own room `user:<id>` (spec 2.8). */
export interface AgentServerEvents {
  'agent.delta': (payload: AgentDeltaPayload) => void;
  'agent.activity': (payload: AgentActivityPayload) => void;
  'agent.done': (payload: AgentDonePayload) => void;
}
