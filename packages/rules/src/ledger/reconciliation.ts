// Daily reconciliation (2.5 invariant 6, spec 2.9, R5.5): ledger cash against the provider balance.

import { assertFcfa, assertNonNegativeFcfa, type Fcfa } from '../money';

export type ReconciliationStatus = 'OK' | 'WARNING' | 'ALERT';

/**
 * 2.5 invariant 6, R5.5: compares the provider's reported balance with the sum of `cash:provider`
 * over every group on that provider account.
 * - OK: they are equal and the ledgers are sound.
 * - WARNING: they differ only by operations still in flight (collections the provider may already
 *   hold, disbursements, fees included, it may already have paid). Nothing is missing.
 * - ALERT: any other difference, or any ledger invariant broken. Withdrawals pause.
 */
export function reconcile(input: {
  ledgerCash: Fcfa;
  providerBalance: Fcfa;
  /** Collections not yet recorded in the ledger, net of fees (most the provider could hold extra). */
  inFlightCollections: Fcfa;
  /** Disbursements not yet recorded, plus their fees (most the provider could have paid out). */
  inFlightDisbursements: Fcfa;
  /** Problems found by checkLedger across the groups (0 when every ledger is sound). */
  ledgerProblemCount: number;
}): { status: ReconciliationStatus; difference: number; withdrawalsPaused: boolean } {
  assertFcfa(input.ledgerCash, 'ledgerCash');
  assertFcfa(input.providerBalance, 'providerBalance');
  assertNonNegativeFcfa(input.inFlightCollections, 'inFlightCollections');
  assertNonNegativeFcfa(input.inFlightDisbursements, 'inFlightDisbursements');
  const difference = input.providerBalance - input.ledgerCash;
  let status: ReconciliationStatus;
  if (input.ledgerProblemCount > 0) status = 'ALERT';
  else if (difference === 0) status = 'OK';
  else if (difference >= -input.inFlightDisbursements && difference <= input.inFlightCollections) {
    status = 'WARNING';
  } else status = 'ALERT';
  return { status, difference, withdrawalsPaused: status === 'ALERT' };
}
