// Small input checks shared by tools; they decide nothing the services would not.
import { agentErrorTexts } from '@njangi/shared/i18n/server/agent';
import type { AgentCtx } from '../types';
import { refused } from './outcomes';
import type { ToolOutcome } from './types';

/** The session the services act as, carrying this turn's language for the cards they build. */
export function serviceActor(ctx: AgentCtx): AgentCtx['actor'] {
  return { ...ctx.actor, lang: ctx.lang };
}

/** A refusal when the member has no active group yet, else null. */
export function needGroup(ctx: AgentCtx): ToolOutcome | null {
  return ctx.groupId ? null : refused('NO_ACTIVE_GROUP', agentErrorTexts.NO_ACTIVE_GROUP[ctx.lang]);
}

/** Lowercase, accents removed, single spaces: "Joël  NDI" -> "joel ndi". */
export function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Picks one name among candidates: an exact full name, else a unique first name or prefix.
 * Returns the index, 'none' or 'ambiguous'.
 */
export function matchName(
  query: string,
  candidates: readonly string[],
): number | 'none' | 'ambiguous' {
  const q = normalizeName(query);
  if (!q) return 'none';
  const names = candidates.map(normalizeName);
  const exact = names.flatMap((n, i) => (n === q ? [i] : []));
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return 'ambiguous';
  const partial = names.flatMap((n, i) =>
    n.split(' ').some((word) => word === q) || n.startsWith(q) ? [i] : [],
  );
  if (partial.length === 1) return partial[0]!;
  return partial.length > 1 ? 'ambiguous' : 'none';
}
