// Shapes of each transaction type (2.5 table): which accounts, with which sign, how many times.

import { parseAccount, type AccountKind } from './accounts';
import type { LedgerEntry, TransactionType } from './types';
import type { LedgerProblemCode } from './validation';

type Sign = '+' | '-' | 'any';
/** [sign, minimum count, maximum count] for one account kind. */
type Slot = [Sign, number, number];
type Shape = Partial<Record<AccountKind, Slot>> & {
  sameMember?: boolean;
  distinctPayables?: boolean;
};

const MANY = Number.MAX_SAFE_INTEGER;

/** 2.5: the postings each type produces (debit +, credit −). REVERSAL mirrors its original. */
export const TRANSACTION_SHAPES: Readonly<Partial<Record<TransactionType, Shape>>> = {
  PAYMENT_RECEIVED: {
    CASH: ['+', 1, 1],
    PAYABLE: ['-', 0, MANY],
    POT: ['-', 0, MANY],
    SOLIDARITY_FUND: ['-', 0, MANY],
    RECEIVABLE: ['-', 0, MANY],
    // R4.2 the fund bears a debt's fee share (debit); D22.2 it keeps what a correction's surcharge
    // paid above the actual share (credit). The exact lines are rebuilt in fee-checks.ts.
    GENERAL_FUND: ['any', 0, MANY],
    sameMember: true,
  },
  FINE_ASSESSED: { RECEIVABLE: ['+', 1, 1], GENERAL_FUND: ['-', 1, 1] },
  BID_ASSESSED: { RECEIVABLE: ['+', 1, 1], GENERAL_FUND: ['-', 1, 1] },
  AUTO_SETTLEMENT: { PAYABLE: ['+', 1, 1], RECEIVABLE: ['-', 1, 1], sameMember: true },
  // D18.1: the exact lines of each purpose are rebuilt from the metadata in fee-checks.ts.
  DISBURSEMENT_SENT: {
    IN_FLIGHT: ['-', 1, 1],
    PAYABLE: ['+', 0, 1],
    RECEIVABLE: ['+', 0, 1],
    GENERAL_FUND: ['-', 0, 1],
    SOLIDARITY_FUND: ['+', 0, 1],
    sameMember: true,
  },
  WITHDRAWAL_COMPLETED: { IN_FLIGHT: ['+', 1, 1], GENERAL_FUND: ['any', 0, 1], CASH: ['-', 1, 1] },
  LOAN_DISBURSED: { IN_FLIGHT: ['+', 1, 1], GENERAL_FUND: ['any', 0, 1], CASH: ['-', 1, 1] },
  SOLIDARITY_DISBURSED: { IN_FLIGHT: ['+', 1, 1], GENERAL_FUND: ['any', 0, 1], CASH: ['-', 1, 1] },
  // D22.1: the send's sources refilled, cash back from the operator; exact lines in inflight-checks.ts.
  DISBURSEMENT_REFUNDED: {
    CASH: ['+', 1, 1],
    PAYABLE: ['-', 0, 1],
    RECEIVABLE: ['-', 0, 1],
    GENERAL_FUND: ['any', 0, 1],
    SOLIDARITY_FUND: ['-', 0, 1],
    sameMember: true,
  },
  LEAVER_REFUND: { PAYABLE: ['-', 1, 1], GENERAL_FUND: ['+', 1, 1] },
  FUND_DISTRIBUTION: { GENERAL_FUND: ['+', 1, 1], PAYABLE: ['-', 1, MANY], distinctPayables: true },
  POT_ASSIGNED: { POT: ['+', 1, 1], PAYABLE: ['-', 1, 1] },
  // D16.1, D18.3: refills a payable (PAYABLE −, RECEIVABLE +) or the solidarity fund (SOLIDARITY −,
  // paid from the debtor's payable first: PAYABLE +, the rest RECEIVABLE +). See clawbackShape.
  CLAWBACK: {
    RECEIVABLE: ['+', 0, 1],
    PAYABLE: ['any', 0, 1],
    SOLIDARITY_FUND: ['-', 0, 1],
    sameMember: true,
  },
  POT_CORRECTION: {
    PAYABLE: ['+', 0, 1],
    RECEIVABLE: ['+', 0, 1],
    POT: ['-', 1, 1],
    sameMember: true,
  },
  // Q1, Q3: the fund gives back (debit); the debt is cancelled (RECEIVABLE −) and/or what was
  // already paid is credited back (PAYABLE −). Exact amounts in release-checks.ts.
  CLAWBACK_RELEASE: {
    SOLIDARITY_FUND: ['+', 1, 1],
    RECEIVABLE: ['-', 0, 1],
    PAYABLE: ['-', 0, 1],
    sameMember: true,
  },
};

const KINDS: readonly AccountKind[] = [
  'CASH',
  'PAYABLE',
  'RECEIVABLE',
  'GENERAL_FUND',
  'SOLIDARITY_FUND',
  'POT',
  'IN_FLIGHT',
];

/** L1, L3: the account kinds whose owner must be the entry's member. */
const OWN_ACCOUNTS: Partial<Record<TransactionType, readonly AccountKind[]>> = {
  PAYMENT_RECEIVED: ['RECEIVABLE'],
  DISBURSEMENT_SENT: ['PAYABLE', 'RECEIVABLE'],
  DISBURSEMENT_REFUNDED: ['PAYABLE', 'RECEIVABLE'],
  POT_CORRECTION: ['PAYABLE', 'RECEIVABLE'],
  CLAWBACK: ['PAYABLE', 'RECEIVABLE'],
  CLAWBACK_RELEASE: ['PAYABLE', 'RECEIVABLE'],
};

type Line = { kind: AccountKind; id: string | null; amount: number };

/** D16.1, D18.3: the two CLAWBACK variants. */
function clawbackShape(entry: LedgerEntry, lines: readonly Line[]): string | null {
  const of = (kind: AccountKind) => lines.filter((l) => l.kind === kind);
  const fromFund = of('SOLIDARITY_FUND').length === 1;
  const hasPayoutSeq = 'solidarityPayoutSeq' in (entry.metadata ?? {});
  if (!fromFund) {
    if (of('PAYABLE').length !== 1 || of('PAYABLE')[0]!.amount > 0 || of('RECEIVABLE').length !== 1)
      return 'a payable CLAWBACK moves the debt from the payable (credit) to the receivable (debit)';
    return hasPayoutSeq ? 'only a solidarity CLAWBACK records solidarityPayoutSeq' : null;
  }
  if (of('PAYABLE').some((l) => l.amount < 0))
    return "a solidarity CLAWBACK takes from the debtor's payable (debit)";
  if (lines.length < 2) return 'a solidarity CLAWBACK names its debtor';
  return hasPayoutSeq ? null : 'a solidarity CLAWBACK records solidarityPayoutSeq';
}

/**
 * 2.5: problems with an entry's shape: an account kind posted the wrong way, too few or too many
 * times; an AUTO_SETTLEMENT or a payment's debts across different members; a member paid twice in
 * one distribution. Assumes the accounts parse (checked by entryProblems first).
 */
export function shapeProblems(entry: LedgerEntry): { code: LedgerProblemCode; detail: string }[] {
  const shape = TRANSACTION_SHAPES[entry.type];
  if (!shape) return [];
  const problems: string[] = [];
  const parsed = entry.postings.map((p) => ({ ...parseAccount(p.account)!, amount: p.amount }));
  for (const kind of KINDS) {
    const lines = parsed.filter((x) => x.kind === kind);
    const slot = shape[kind];
    if (!slot) continue;
    const [sign, min, max] = slot;
    if (lines.length < min || lines.length > max)
      problems.push(
        `${entry.type} needs ${min} to ${max === MANY ? 'any number of' : max} ${kind} postings`,
      );
    for (const line of lines) {
      if ((sign === '+' && line.amount < 0) || (sign === '-' && line.amount > 0)) {
        problems.push(`${kind} must be ${sign === '+' ? 'a debit' : 'a credit'} in ${entry.type}`);
      }
    }
  }
  if (shape.sameMember) {
    const members = new Set(
      parsed
        .filter(
          (x) =>
            x.kind === 'RECEIVABLE' || (entry.type !== 'PAYMENT_RECEIVED' && x.kind === 'PAYABLE'),
        )
        .map((x) => x.id),
    );
    if (members.size > 1) problems.push(`${entry.type} must concern the same member`);
  }
  for (const kind of OWN_ACCOUNTS[entry.type] ?? []) {
    if (parsed.some((x) => x.kind === kind && x.id !== entry.membershipId)) {
      problems.push(`the ${kind.toLowerCase()} of ${entry.type} must be the entry's member`);
    }
  }
  if (
    (entry.type === 'DISBURSEMENT_SENT' || entry.type === 'DISBURSEMENT_REFUNDED') &&
    !entry.membershipId
  ) {
    problems.push(`a ${entry.type} names its recipient (membershipId)`);
  }
  // L3: the payer is needed to record a provider reversal (D18.3: the payer may owe a shortfall).
  if (entry.type === 'PAYMENT_RECEIVED' && !entry.membershipId) {
    problems.push('a PAYMENT_RECEIVED names its payer (membershipId)');
  }
  if (entry.type === 'CLAWBACK') {
    const issue = clawbackShape(entry, parsed);
    if (issue) problems.push(issue);
  }
  if (shape.distinctPayables) {
    const ids = parsed.filter((x) => x.kind === 'PAYABLE').map((x) => x.id);
    if (new Set(ids).size !== ids.length)
      problems.push('a member appears twice in the distribution');
  }
  return problems.map((detail) => ({ code: 'SHAPE_MISMATCH', detail }));
}
