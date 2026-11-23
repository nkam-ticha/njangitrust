// What the agent needs from services that are not built yet (money, chat, meetings, statements,
// account changes). Like the governance ports, the owning module implements its port and registers
// it at start-up; until then every tool that needs it answers a typed UNAVAILABLE the model
// explains. Each method acts as `ctx.actor`, checks permissions itself (can()), and returns either
// a PendingAction prepared through createPendingAction (origin AGENT) or agent-ready data: minimal,
// allowlisted, amounts formatted with formatXAF and dates in Douala time in `ctx.lang`.
import type { AgentCapability } from '@njangi/shared/i18n/server/agent';
import type { PendingAction } from '../lib/prisma';
import type { AgentCtx } from './types';

export type AgentData = Record<string, unknown>;

/** Session lines from the money services (spec 4.3), already formatted. */
export interface SessionMoneyLines {
  /** "cycle 1, tour 4 sur 10". */
  cycle?: string;
  /** "Carine Fotso; deadline: vendredi 6 novembre 18:00; payout: samedi 7 novembre 18:00". */
  beneficiary?: string;
  /** ["myRound4", "à payer, 11 000 FCFA"]. */
  myRound?: [string, string];
  /** "disponible 0 FCFA, bloqué 0 FCFA, dettes 0 FCFA, retenue: aucune". */
  myMoney?: string;
}

export interface AgentMoneyPort {
  sessionLines(ctx: AgentCtx): Promise<SessionMoneyLines>;
  overview(ctx: AgentCtx, input: { scope: 'group' | 'all' }): Promise<AgentData>;
  round(ctx: AgentCtx, input: { round?: number }): Promise<AgentData>;
  unpaid(ctx: AgentCtx, input: { round?: number }): Promise<AgentData>;
  payoutBreakdown(ctx: AgentCtx, input: { round?: number }): Promise<AgentData>;
  funds(ctx: AgentCtx): Promise<AgentData>;
  ledger(
    ctx: AgentCtx,
    input: { member?: string; type?: string; from?: string; to?: string; limit: number },
  ): Promise<AgentData>;
  loans(ctx: AgentCtx, input: { status?: string; member?: string }): Promise<AgentData>;
  loanQuote(ctx: AgentCtx, input: { amount: number; months: number }): Promise<AgentData>;
  bids(ctx: AgentCtx, input: { round?: number }): Promise<AgentData>;
  /** A download card for the ledger export (spec 2.14); the file never reaches the model. */
  exportLedger(ctx: AgentCtx, input: { format: 'json' | 'csv' }): Promise<AgentData>;
  /** A short neutral line about the withdrawal hold, or null: for get_my_payment_number. */
  holdLine(ctx: AgentCtx): Promise<string | null>;
  pay(ctx: AgentCtx, input: { round?: number; includeDueDebts?: boolean }): Promise<PendingAction>;
  payDebts(ctx: AgentCtx, input: { items?: string[] }): Promise<PendingAction>;
  withdraw(ctx: AgentCtx, input: { amount?: number; all?: true }): Promise<PendingAction>;
  requestLoan(ctx: AgentCtx, input: { amount: number; months: number }): Promise<PendingAction>;
  repayLoan(ctx: AgentCtx, input: { amount?: number }): Promise<PendingAction>;
  decideLoan(
    ctx: AgentCtx,
    input: { loanId: string; decision: 'approve' | 'reject'; reason: string },
  ): Promise<PendingAction>;
  placeBid(ctx: AgentCtx, input: { round?: number; amount: number }): Promise<PendingAction>;
}

/** One chat message for a summary (4.9): voice notes and media are listed, never transcribed. */
export interface UnreadSource {
  messages: { author: string; kind: string; text: string | null; at: string }[];
  /** Messages beyond the 500 most recent. */
  moreCount: number;
  /** Money and governance events of the period, already worded. */
  events: string[];
  /** "3 photos et 2 notes vocales de Paul". */
  media: string[];
}

export interface AgentChatPort {
  unread(ctx: AgentCtx): Promise<UnreadSource>;
  markRead(ctx: AgentCtx): Promise<void>;
  search(ctx: AgentCtx, input: { query: string; from?: string; to?: string }): Promise<AgentData>;
  preparePost(ctx: AgentCtx, input: { text: string }): Promise<PendingAction>;
  prepareAnnouncement(ctx: AgentCtx, input: { text: string }): Promise<PendingAction>;
  prepareHide(ctx: AgentCtx, input: { messageId: string; reason: string }): Promise<PendingAction>;
  /** The text of an @njangi message, for its author only (4.4). */
  mentionText(input: {
    groupId: string;
    messageId: string;
    userId: string;
  }): Promise<string | null>;
  /** Posts the agent's answer in the group as an AGENT message everyone sees. */
  postAgentReply(input: { groupId: string; text: string; replyToMessageId: string }): Promise<void>;
  /** True when the agent already answered this message in the group (an answer is posted once). */
  hasAgentReply?(input: { groupId: string; messageId: string }): Promise<boolean>;
}

export interface AgentMeetingsPort {
  get(ctx: AgentCtx, input: { id?: string }): Promise<AgentData>;
  prepareAgendaItem(
    ctx: AgentCtx,
    input: { text: string; meetingId?: string },
  ): Promise<PendingAction>;
  prepareCheckIn(ctx: AgentCtx, input: { meetingId?: string }): Promise<PendingAction>;
  prepareExcuse(
    ctx: AgentCtx,
    input: { reason: string; meetingId?: string },
  ): Promise<PendingAction>;
  prepareSchedule(
    ctx: AgentCtx,
    input: { date: string; time: string; place: string },
  ): Promise<PendingAction>;
  prepareAttendance(
    ctx: AgentCtx,
    input: { meetingId: string; member: string; present: boolean },
  ): Promise<PendingAction>;
  /** Fills the fixed minutes template (R15.4, spec 4.9); nothing is published. */
  draftMinutes(ctx: AgentCtx, input: { meetingId: string; notes?: string }): Promise<AgentData>;
  preparePublish(ctx: AgentCtx, input: { meetingId: string; text: string }): Promise<PendingAction>;
}

export interface AgentStatementsPort {
  /** Creates the statement if needed; returns its id and a period label. */
  statement(
    ctx: AgentCtx,
    input: { period?: string },
  ): Promise<{ statementId: string; period: string }>;
}

export interface AgentAccountPort {
  prepareChangePaymentNumber(
    ctx: AgentCtx,
    input: { number: string; operator?: 'MTN' | 'ORANGE' },
  ): Promise<PendingAction>;
  prepareDeleteAccount(ctx: AgentCtx): Promise<PendingAction>;
}

export interface AgentPorts {
  money?: AgentMoneyPort;
  chat?: AgentChatPort;
  meetings?: AgentMeetingsPort;
  statements?: AgentStatementsPort;
  account?: AgentAccountPort;
}

let ports: AgentPorts = {};

/** Start-up: each module registers its port when its services exist. */
export function registerAgentPorts(next: AgentPorts): void {
  ports = { ...ports, ...next };
}

export function agentPorts(): AgentPorts {
  return ports;
}

/** Tests only. */
export function resetAgentPortsForTests(): void {
  ports = {};
}

export type PortCapability = Exclude<AgentCapability, 'cycles'>;

export function hasPort(capability: PortCapability): boolean {
  return ports[capability] !== undefined;
}
