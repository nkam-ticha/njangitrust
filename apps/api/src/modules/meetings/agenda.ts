// The automatic agenda (R15.2): the round's beneficiary and status, unpaid members, open votes, loan
// installments due and solidarity requests. The lines are the designer's copy (meetings.agenda.autoItems),
// in both languages. Installments and solidarity requests are listed without names or amounts, like
// the copy, so the agenda never says more than the screens of those features do (D20.2).
import type { Bilingual } from '@njangi/shared';
import { ui } from '../../lib/texts';

export interface AutoAgendaInput {
  /** The round in progress, from the money port; null when there is none or no port. */
  round: {
    number: number;
    beneficiaryName: string | null;
    paidCount: number;
    memberCount: number;
  } | null;
  /** Members who have not paid the round, in a stable order. */
  unpaidNames: readonly string[];
  openVotes: number;
  installmentsDue: number;
  solidarityOpen: number;
}

export interface AutoAgendaItem {
  /** Stable within a meeting: the app can key a list on it. */
  key: 'round' | 'unpaid' | 'votes' | 'installments' | 'solidarity';
  text: Bilingual;
}

/** Items appear in the order of R15.2; an empty category adds no line. */
export function buildAutoAgenda(input: AutoAgendaInput): AutoAgendaItem[] {
  const items: AutoAgendaItem[] = [];
  if (input.round) {
    const { round } = input;
    items.push({
      key: 'round',
      text: ui((c) => c.meetings.agenda.autoItems.round, {
        round: round.number,
        name: round.beneficiaryName ?? '—',
        paid: round.paidCount,
        total: round.memberCount,
      }),
    });
  }
  if (input.unpaidNames.length > 0) {
    items.push({
      key: 'unpaid',
      text: ui((c) => c.meetings.agenda.autoItems.unpaid, { names: input.unpaidNames.join(', ') }),
    });
  }
  if (input.openVotes > 0) {
    items.push({
      key: 'votes',
      text:
        input.openVotes === 1
          ? ui((c) => c.meetings.agenda.autoItems.votes_one, { count: 1 })
          : ui((c) => c.meetings.agenda.autoItems.votes_other, { count: input.openVotes }),
    });
  }
  if (input.installmentsDue > 0) {
    items.push({ key: 'installments', text: ui((c) => c.meetings.agenda.autoItems.installments) });
  }
  if (input.solidarityOpen > 0) {
    items.push({ key: 'solidarity', text: ui((c) => c.meetings.agenda.autoItems.solidarity) });
  }
  return items;
}
