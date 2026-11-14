// One definition per proposal type (R11.1). The generic flow (create card, vote, close, apply)
// lives in the proposals module; a definition only says what is specific to its type.
import type { ProposalType, RuleSetParams } from '@njangi/rules';
import { formatDateLong, type Bilingual } from '@njangi/shared';
import type { ProposalSubjectDto } from '@njangi/shared/contracts/proposals';
import type { z } from 'zod';
import type { EffectSink } from '../../../lib/after-commit';
import type { Db, Prisma, Proposal } from '../../../lib/prisma';
import type { GroupStatus, MembershipRef } from '../../../permissions';
import { ui } from '../../../lib/texts';

export interface ActiveMember {
  id: string;
  userId: string;
  role: 'ADMIN' | 'MEMBER';
  status: 'ACTIVE' | 'LEAVING';
  name: string;
}

export interface PlanContext {
  db: Db;
  now: Date;
  userId: string;
  group: { id: string; name: string; status: GroupStatus };
  proposer: MembershipRef;
  /** ACTIVE and LEAVING members (3.1: those who vote), ordered by id. */
  activeMembers: ActiveMember[];
  /** Every member who ever joined, by membership id (names for titles). */
  names: ReadonlyMap<string, string>;
  /** The latest rule set version. */
  params: RuleSetParams;
}

export interface ProposalPlan<P> {
  /** What is stored on the proposal (snapshots such as a rule's current value included). */
  payload: P;
  /** The member the proposal is about (removal target, new admin, leaver, fined member, ...). */
  subjectMembershipId: string | null;
  /** Excluded from the vote by its type (R11.1): passed to `eligibleVoters`. */
  excludedMembershipId: string | null;
  /** ROTATION_CHANGE: members whose turn moves. */
  mustApprove: string[];
  /** Extra lines for the confirmation card. */
  notes: Bilingual[];
}

export interface ApplyContext {
  tx: Prisma.TransactionClient;
  proposal: Proposal;
  now: Date;
  effects: EffectSink;
  group: { id: string; name: string };
  names: ReadonlyMap<string, string>;
}

export interface ProposalDefinition<I = unknown, P = unknown> {
  type: ProposalType;
  /** The request, normalised by the service (ids, keyed hashes): the PendingAction's args. */
  input: z.ZodType<I>;
  /** Stored payload (no phone number, no secret), checked again when applied. */
  payload: z.ZodType<P>;
  /** Every check, then the stored payload; throws an AppError to refuse. Read-only. */
  plan(ctx: PlanContext, input: I): Promise<ProposalPlan<P>>;
  /** Public title (designer copy votes.titles.*) and subject, from the payload and member names. */
  describe(
    payload: P,
    names: ReadonlyMap<string, string>,
  ): { title: Bilingual; subject: ProposalSubjectDto };
  /** After the proposal row is created, in the same transaction (e.g. the SolidarityRequest). */
  afterCreate?(tx: Prisma.TransactionClient, proposal: Proposal, payload: P): Promise<void>;
  /** R11.8: applies a passed proposal; returns the effect shown on the card. */
  apply(ctx: ApplyContext, payload: P): Promise<Bilingual | null>;
  /** A proposal that did not pass (rejected or expired): release what was waiting on it. */
  onNotPassed?(ctx: ApplyContext, payload: P): Promise<void>;
}

/** Identity helper keeping the payload typed. */
export function defineProposal<I, P>(
  definition: ProposalDefinition<I, P>,
): ProposalDefinition<I, P> {
  return definition;
}

/** A member's name for titles; members who were anonymised still have a placeholder. */
export function nameOf(names: ReadonlyMap<string, string>, membershipId: string): string {
  return names.get(membershipId) ?? '—';
}

export function memberRef(names: ReadonlyMap<string, string>, membershipId: string) {
  return { membershipId, name: nameOf(names, membershipId) };
}

/** "Appliqué le mardi 4 novembre" (votes.card.effect.immediate), in Douala time. */
export function appliedOn(now: Date): Bilingual {
  return ui((c) => c.votes.card.effect.immediate, {
    date: { fr: formatDateLong(now, 'fr'), en: formatDateLong(now, 'en') },
  });
}
