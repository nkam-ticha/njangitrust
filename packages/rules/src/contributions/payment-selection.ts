// Choosing what to pay (R3.3) and turning obligations into one payment (R3.2, R3.6, spec 2.6).

import type { PaymentPart, PaymentPartKind } from '../fees';
import { sumFcfa, type Fcfa } from '../money';
import type { Refusal } from '../result';
import { assertDate } from '../time';
import type { ObligationKind, ObligationStatus } from './obligations';

/** An obligation as the services load it, for choosing and preparing payments. */
export interface OpenObligation {
  id: string;
  kind: ObligationKind;
  membershipId: string;
  amount: Fcfa;
  dueAt: Date;
  roundId: string | null;
  roundNumber: number | null;
  creditorMembershipId: string | null;
  status: ObligationStatus;
  /** Spec 2.6 rule 3: true while a PENDING PaymentIntent already covers it. */
  inPendingPayment: boolean;
}

const DEBT_KINDS: readonly ObligationKind[] = [
  'FINE',
  'BID',
  'LOAN_INSTALLMENT',
  'SHORTFALL_SHARE',
];
const KIND_ORDER: readonly ObligationKind[] = [
  'CONTRIBUTION',
  'SOLIDARITY',
  'SHORTFALL_SHARE',
  'BID',
  'FINE',
  'LOAN_INSTALLMENT',
];

const payable = (o: OpenObligation) => o.status === 'DUE' && !o.inPendingPayment;

function oldestFirst(a: OpenObligation, b: OpenObligation): number {
  const byDate = a.dueAt.getTime() - b.dueAt.getTime();
  return byDate !== 0 ? byDate : KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
}

/**
 * R3.3, R3.6: the round the confirmation card proposes first, the oldest one the member still owes,
 * with its contribution and solidarity; optionally with the member's due debts (never an
 * installment not yet due). Null when nothing is owed. The member can change the choice.
 */
export function proposeRoundToPay(
  obligations: readonly OpenObligation[],
  options: { now: Date; includeDueDebts?: boolean },
): { roundId: string; roundNumber: number | null; obligationIds: string[]; total: Fcfa } | null {
  const now = assertDate(options.now, 'now');
  const roundItems = obligations
    .filter(
      (o) => payable(o) && (o.kind === 'CONTRIBUTION' || o.kind === 'SOLIDARITY') && o.roundId,
    )
    .sort(oldestFirst);
  const oldest = roundItems[0];
  if (!oldest) return null;
  const chosen = roundItems.filter((o) => o.roundId === oldest.roundId);
  if (options.includeDueDebts) {
    chosen.push(
      ...obligations
        .filter((o) => payable(o) && DEBT_KINDS.includes(o.kind) && o.dueAt.getTime() <= now)
        .sort(oldestFirst),
    );
  }
  return {
    roundId: oldest.roundId!,
    roundNumber: oldest.roundNumber,
    obligationIds: chosen.map((o) => o.id),
    total: sumFcfa(chosen.map((o) => o.amount)),
  };
}

function partKind(kind: ObligationKind): PaymentPartKind {
  switch (kind) {
    case 'CONTRIBUTION':
      return 'CONTRIBUTION';
    case 'SOLIDARITY':
      return 'SOLIDARITY';
    case 'SHORTFALL_SHARE':
      return 'SHORTFALL';
    default:
      return 'DEBT';
  }
}

/**
 * R3.2, R3.6, spec 2.6 rule 3: checks the obligations a member wants to pay in one Mobile Money
 * request and returns the exact total and the payment parts (for the fee split and the ledger).
 * A bidding round's contribution goes to the round pot while its beneficiary is unknown.
 */
export function preparePayment(input: {
  payerMembershipId: string;
  obligations: readonly OpenObligation[];
}):
  | { ok: true; total: Fcfa; parts: PaymentPart[] }
  | Refusal<'NOTHING_TO_PAY'>
  | Refusal<
      'DUPLICATE_OBLIGATION' | 'NOT_YOUR_OBLIGATION' | 'PAYMENT_ALREADY_PENDING',
      { obligationId: string }
    >
  | Refusal<'OBLIGATION_NOT_DUE', { obligationId: string; status: ObligationStatus }> {
  if (input.obligations.length === 0) return { ok: false, code: 'NOTHING_TO_PAY' };
  const seen = new Set<string>();
  for (const o of input.obligations) {
    if (seen.has(o.id)) return { ok: false, code: 'DUPLICATE_OBLIGATION', obligationId: o.id };
    seen.add(o.id);
    if (o.membershipId !== input.payerMembershipId) {
      return { ok: false, code: 'NOT_YOUR_OBLIGATION', obligationId: o.id };
    }
    if (o.status !== 'DUE')
      return { ok: false, code: 'OBLIGATION_NOT_DUE', obligationId: o.id, status: o.status };
    if (o.inPendingPayment)
      return { ok: false, code: 'PAYMENT_ALREADY_PENDING', obligationId: o.id };
  }
  const parts: PaymentPart[] = input.obligations.map((o) => {
    const toPot = o.kind === 'CONTRIBUTION' && !o.creditorMembershipId;
    return {
      kind: partKind(o.kind),
      amount: o.amount,
      creditorMembershipId: toPot ? null : o.creditorMembershipId,
      potRoundId: toPot ? o.roundId : null,
      tieOrder: o.roundNumber ?? 0,
      ref: o.id,
    };
  });
  return { ok: true, total: sumFcfa(parts.map((p) => p.amount)), parts };
}
