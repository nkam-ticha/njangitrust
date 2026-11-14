// Choosing what to pay (R3.3) and turning obligations into one payment (R3.2, R3.6, spec 2.6).

import {
  collectionFeeShares,
  scheduleFee,
  type FeeSchedule,
  type PaymentPart,
  type PaymentPartKind,
} from '../fees';
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
  /**
   * L2: a LOAN_INSTALLMENT of a loan whose disbursement is still in flight (sent, not confirmed). It
   * cannot be paid yet: if the send failed, the returned loan would leave the receivable below zero.
   */
  loanInFlight?: boolean;
}

const DEBT_KINDS: readonly ObligationKind[] = [
  'FINE',
  'BID',
  'CORRECTION',
  'LOAN_INSTALLMENT',
  'SHORTFALL_SHARE',
];
const KIND_ORDER: readonly ObligationKind[] = [
  'CONTRIBUTION',
  'SOLIDARITY',
  'SHORTFALL_SHARE',
  'BID',
  'FINE',
  'CORRECTION',
  'LOAN_INSTALLMENT',
];

const payable = (o: OpenObligation) =>
  o.status === 'DUE' && !o.inPendingPayment && o.loanInFlight !== true;

function oldestFirst(a: OpenObligation, b: OpenObligation): number {
  const byDate = a.dueAt.getTime() - b.dueAt.getTime();
  return byDate !== 0 ? byDate : KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
}

/**
 * R3.3, R3.6: the round the confirmation card proposes first, the oldest one the member still owes,
 * with its contribution and solidarity; optionally with the member's due debts (never an
 * installment not yet due, nor one of a loan still in flight, L2). Null when nothing is owed. The
 * member can change the choice.
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

/** Most rounds of the D22.2 surcharge search before giving up (a sane fee schedule needs 2 or 3). */
const MAX_SURCHARGE_ROUNDS = 64;

/**
 * D22.2: the fee each correction part's payer adds so that, at the schedule's fee for the whole card,
 * the part's R4.2 share is covered: start at 0, raise each surcharge to its share of the fee on the
 * card that includes the surcharges, until no share is above what is charged.
 */
function correctionSurcharges(parts: PaymentPart[], corrections: number[], schedule: FeeSchedule) {
  const charged = parts.map(() => 0);
  for (let round = 0; round < MAX_SURCHARGE_ROUNDS; round++) {
    const amounts = parts.map((p, i) => ({ ...p, amount: p.amount + charged[i]! }));
    const total = sumFcfa(amounts.map((p) => p.amount));
    const fee = scheduleFee(schedule, 'COLLECTION', total);
    if (fee > total) {
      // A tiny debt below the fee: the card must at least carry the fee itself.
      const first = corrections[0]!;
      charged[first] = charged[first]! + fee - total;
      continue;
    }
    const shares = collectionFeeShares(amounts, fee);
    let raised = false;
    for (const i of corrections) {
      if (shares[i]! > charged[i]!) {
        charged[i] = shares[i]!;
        raised = true;
      }
    }
    if (!raised) return charged;
  }
  throw new RangeError('the fee schedule gives no stable fee for this payment');
}

/**
 * R3.2, R3.6, spec 2.6 rule 3: checks the obligations a member wants to pay in one Mobile Money
 * request and returns the exact total and the payment parts (for the fee split and the ledger).
 * A contribution keeps only its round: its beneficiary or pot is resolved when the payment is
 * posted (resolvePaymentParts, R3.4). D22.2: a CORRECTION debt's payer bears its collection fee: its
 * part is the debt plus its share of the schedule fee (`feeCharged`), so `feeSchedule` is required
 * then; other debts keep R4.2. L2: an installment of a loan still in flight is refused.
 */
export function preparePayment(input: {
  payerMembershipId: string;
  obligations: readonly OpenObligation[];
  /** D22.2: the collection fee schedule, needed to price a CORRECTION debt. */
  feeSchedule?: FeeSchedule;
}):
  | { ok: true; total: Fcfa; parts: PaymentPart[] }
  | Refusal<'NOTHING_TO_PAY'>
  | Refusal<
      'DUPLICATE_OBLIGATION' | 'NOT_YOUR_OBLIGATION' | 'PAYMENT_ALREADY_PENDING' | 'LOAN_IN_FLIGHT',
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
    if (o.loanInFlight === true) return { ok: false, code: 'LOAN_IN_FLIGHT', obligationId: o.id };
  }
  const parts: PaymentPart[] = input.obligations.map((o) => {
    const kind = partKind(o.kind);
    return {
      kind,
      amount: o.amount,
      roundId: kind === 'CONTRIBUTION' ? o.roundId : null,
      creditorMembershipId: kind === 'SHORTFALL' ? o.creditorMembershipId : null,
      ref: o.id,
    };
  });
  const corrections = input.obligations.flatMap((o, i) => (o.kind === 'CORRECTION' ? [i] : []));
  if (corrections.length > 0) {
    if (!input.feeSchedule)
      throw new RangeError('a correction debt needs the fee schedule (D22.2)');
    const charged = correctionSurcharges(parts, corrections, input.feeSchedule);
    for (const i of corrections) {
      if (charged[i]! > 0)
        parts[i] = {
          ...parts[i]!,
          amount: parts[i]!.amount + charged[i]!,
          feeCharged: charged[i]!,
        };
    }
  }
  return { ok: true, total: sumFcfa(parts.map((p) => p.amount)), parts };
}
