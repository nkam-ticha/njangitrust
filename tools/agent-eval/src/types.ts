// The evaluation's vocabulary (spec 5.4): a scenario, what one run of it produced, and a verdict.

export type Lang = 'fr' | 'en';
export type Channel = 'PRIVATE' | 'GROUP';

/** Parts of the app a scenario needs. Anything not built yet makes the scenario SKIPPED. */
export type Need =
  | 'money'
  | 'cycles'
  | 'chat'
  | 'meetings'
  | 'statements'
  | 'account'
  | 'bidding'
  /** Chat messages in the demo data (the injected order of S07, voice notes for S16). */
  | 'demoChat';

export interface ScriptedToolCall {
  name: string;
  args?: Record<string, unknown>;
}

/** One step of the scripted model: tool calls, or the final reply (with {{placeholders}}). */
export interface ScriptStep {
  tools?: ScriptedToolCall[];
  reply?: string;
}

export interface ScenarioTurn {
  /** What the member says. */
  user?: string;
  /** Or: the result of the action prepared before (spec 4.5 step 5). */
  event?: { status: 'DONE' | 'FAILED' };
}

export interface ScenarioExpect {
  toolsCalled?: string[];
  toolsForbidden?: string[];
  /** At least one of these lists must have been called in full. */
  anyOfTools?: string[][];
  /** Turn index -> the tools that turn must call ([] means none). */
  toolsCalledOnTurn?: Record<string, string[]>;
  /** Tool name -> arguments its call must contain. */
  toolArgs?: Record<string, Record<string, unknown>>;
  noToolCalls?: boolean;
  /** No digit at all in any reply. */
  noDigits?: boolean;
  /** No confirmation card may be prepared. */
  noCard?: boolean;
  /** An information card of this type must be returned. */
  card?: string;
  /** Regular expressions (a leading "(?i)" means case-insensitive) on the replies. */
  mustMatch?: string[];
  mustNotMatch?: string[];
  mustMatchLast?: string[];
  /** The reply must repeat an exact string field from the named tool result. */
  mustRepeatToolFields?: { tool: string; field: string }[];
  mustNotClaimDone?: boolean;
  /** The reply after a DONE event repeats the reference the event carries. */
  mustQuoteEventRef?: boolean;
  /** The reply lists names: no amount, no number. */
  namesOnly?: boolean;
  /** Every amount of the reply is on the server's confirmation card. */
  matchesCard?: boolean;
  mentionsDate?: boolean;
  /** GROUP: the group sees only "answered privately"; the answer is in the private conversation. */
  groupReply?: 'private';
  privateToolsCalled?: string[];
}

export interface Scenario {
  id: string;
  title: string;
  channel: Channel;
  /** A demo member's key (tools/demo-seed people). */
  member: string;
  language: Lang;
  needs: Need[];
  turns: ScenarioTurn[];
  expect: ScenarioExpect;
  /** Scripted mode: for each turn, the model's steps. */
  script: ScriptStep[][];
}

export interface ToolCallEvidence {
  name: string;
  status: string;
  args: Record<string, unknown>;
}

/** What one turn produced, and exactly what the model had been given. */
export interface TurnEvidence {
  index: number;
  kind: 'user' | 'event';
  /** The member's text (user turns). */
  said: string | null;
  reply: string;
  /** GROUP channel: what the group saw. */
  groupReply: string | null;
  toolCalls: ToolCallEvidence[];
  /** Confirmation cards prepared in this turn, as the server drew them (serialised previews). */
  cards: string[];
  /** Information cards returned (types). */
  infoCards: string[];
  /** The session block the model received. */
  sessionBlock: string;
  /** Tool results the model received in this turn, as sent. */
  toolResults: string[];
  /** Result events the model received (this turn and before). */
  events: { status: string; text: string }[];
}

export interface RunEvidence {
  ownPhones: string[];
  turns: TurnEvidence[];
}

export interface CheckFailure {
  check: string;
  message: string;
  evidence?: string;
}

export type RunStatus = 'PASS' | 'FAIL' | 'SKIPPED';

export interface RunRecord {
  scenario: string;
  title: string;
  run: number;
  status: RunStatus;
  /** SKIPPED: why. */
  reason?: string;
  failures: CheckFailure[];
  evidence?: RunEvidence;
}

/** Raised by a driver when it cannot perform a step yet; the scenario is then SKIPPED. */
export class NotAvailable extends Error {
  override name = 'NotAvailable';
}
