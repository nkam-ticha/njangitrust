// The PendingAction handler interface (spec 4.5, CLAUDE.md rule 5). Each module that moves money
// or changes the group registers one handler per action type:
//
//   export const payHandler = defineActionHandler({
//     type: 'PAY',
//     level: 'L1',
//     args: payArgsSchema,                       // zod schema of the stored, normalised args
//     async prepare(ctx, args) { ...; return preview },   // or throw an AppError to refuse
//     async execute(ctx, args) { ...; return { outcome: 'done', resultRef } },
//   });
//
// Rules for handlers
// - `args` are normalised by the service before the action is created: resolved ids, integer
//   amounts, and never a raw phone number, PIN or token (store a keyed hash instead).
// - `prepare` checks everything through the services (permissions with `ctx.userId`, rules,
//   amounts) without changing anything, and returns the card. It runs when the action is created
//   and again, inside the confirm transaction, just before `execute`. The preview must depend only
//   on the state, never on the clock: if the re-check builds a different card, the confirmation
//   fails with ACTION_CHANGED and nothing executes (the member is debited exactly what they saw).
// - `execute` writes through `ctx.db` (the confirm transaction, which also records the result) and
//   puts external effects (provider calls, realtime, pushes) in `ctx.afterCommit`. It runs at most
//   once per action. Return `processing` when an external operation continues after the commit
//   (a Mobile Money request); the module later calls `completePendingAction`.
// - The acting member is always `ctx.userId`, never a value from `args`.
import type { Bilingual, Lang } from '@njangi/shared';
import type { ActionPreview } from '@njangi/shared/contracts/pending-actions';
import type { z } from 'zod';
import type { Effect, EffectSink } from '../../lib/after-commit';
import type { Db, Prisma } from '../../lib/prisma';

export type ActionLevel = 'L1' | 'L2';
export type ActionOrigin = 'AGENT' | 'UI';

export interface ActionContext {
  /** The member who owns the action; the only identity a handler may act as. */
  userId: string;
  groupId: string | null;
  lang: Lang;
  origin: ActionOrigin;
  now: Date;
  /** The plain client when the action is created; the confirm transaction when it is confirmed. */
  db: Db;
}

export interface ExecuteContext extends ActionContext {
  db: Prisma.TransactionClient;
  pendingActionId: string;
  /** Runs after the confirm transaction commits. */
  afterCommit(effect: Effect): void;
  /** The same queue, for services that take an EffectSink (system messages, notifications). */
  effects: EffectSink;
}

export interface ExecuteResult {
  /** `done`: finished in this transaction. `processing`: an external operation continues. */
  outcome: 'done' | 'processing';
  /** The record produced (payment intent, invite, vote receipt, ...). */
  resultRef?: string | null;
  /** Short result shown on the card ("Payé, réf. MP2611…"). */
  summary?: Bilingual | null;
  /** Returned once to the confirming client and never stored (an invite link). */
  data?: Record<string, unknown> | null;
}

export interface ActionHandler<A = unknown> {
  /** Stable SCREAMING_SNAKE_CASE type: PAY, WITHDRAW, INVITE_CREATE, VOTE_CAST, ... */
  type: string;
  /** L1: one tap. L2: one tap and the member's PIN (R13.2). */
  level: ActionLevel;
  /** Schema of the stored args, checked when created and again when confirmed. */
  args: z.ZodType<A>;
  /** Returns the card, or throws an AppError explaining the refusal. Changes nothing. */
  prepare(ctx: ActionContext, args: A): Promise<ActionPreview>;
  execute(ctx: ExecuteContext, args: A): Promise<ExecuteResult>;
  /**
   * Confidential actions (a secret vote's choice, R11.5): while pending, args and preview are
   * stored encrypted; once the action leaves PENDING (done, failed, cancelled, expired) they are
   * replaced for good by `redacted(args)`, which must not contain the confidential part.
   */
  confidential?(args: A): boolean;
  redacted?(args: A): { args: Record<string, unknown>; preview: ActionPreview };
}

/** Identity helper that keeps `args` typed in the handler body. */
export function defineActionHandler<A>(handler: ActionHandler<A>): ActionHandler<A> {
  return handler;
}
