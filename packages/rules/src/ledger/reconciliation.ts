// Daily reconciliation (2.5 invariant 6, spec 2.9, R5.5): ledger cash against the provider balance.

import { assertFcfa, assertNonNegativeFcfa, type Fcfa } from '../money';

export type ReconciliationStatus = 'OK' | 'WARNING' | 'ALERT';

/**
 * 2.5 invariant 6, R5.5: compares the provider's reported balance with the sum of `cash:provider`
 * over every group on that provider account.
 * - OK: they are equal and the ledgers are sound.
 * - WARNING: they differ only by operations still in flight (collections the provider may already
 *   hold, disbursements, fees included, it may already have paid, with up to `inFlightFeeTolerance`
 *   more in fees than estimated, L5). Nothing is missing.
 * - ALERT: any other difference, any ledger invariant broken, or reserved money not covered by
 *   cash NOW (D16.2). Withdrawals and every other disbursement pause. Coverage is current state (H1):
 *   once the debts a reversal created are paid and cash covers again, the status returns to OK.
 */
export function reconcile(input: {
  ledgerCash: Fcfa;
  providerBalance: Fcfa;
  /** Collections not yet recorded in the ledger, net of fees (most the provider could hold extra). */
  inFlightCollections: Fcfa;
  /**
   * D18.1: the in-flight accounts summed over the groups (summary.inFlight: amounts plus estimated
   * fees), the most the provider could already have paid out.
   */
  inFlightDisbursements: Fcfa;
  /**
   * L5, R4.3: how much more than their estimated fees the provider may have charged on the
   * disbursements in flight (it can pay before the ledger records the actual fee). Convention for the
   * services: the sum of the in-flight disbursements' estimated fees, i.e. a fee up to twice its
   * estimate is still a WARNING; anything beyond is an ALERT.
   */
  inFlightFeeTolerance: Fcfa;
  /** Problems found by checkLedger across the groups (0 when every ledger is sound; coverage is not one). */
  ledgerProblemCount: number;
  /** D16.2, H1: the CURRENT reservedShortfall of each group's balances, summed (0 when all are covered). */
  reservedShortfall: Fcfa;
}): { status: ReconciliationStatus; difference: number; withdrawalsPaused: boolean } {
  assertFcfa(input.ledgerCash, 'ledgerCash');
  assertFcfa(input.providerBalance, 'providerBalance');
  assertNonNegativeFcfa(input.inFlightCollections, 'inFlightCollections');
  assertNonNegativeFcfa(input.inFlightDisbursements, 'inFlightDisbursements');
  assertNonNegativeFcfa(input.inFlightFeeTolerance, 'inFlightFeeTolerance');
  const difference = input.providerBalance - input.ledgerCash;
  let status: ReconciliationStatus;
  assertNonNegativeFcfa(input.reservedShortfall, 'reservedShortfall');
  if (input.ledgerProblemCount > 0 || input.reservedShortfall > 0) status = 'ALERT';
  else if (difference === 0) status = 'OK';
  else if (
    difference >= -(input.inFlightDisbursements + input.inFlightFeeTolerance) &&
    difference <= input.inFlightCollections
  ) {
    status = 'WARNING';
  } else status = 'ALERT';
  return { status, difference, withdrawalsPaused: status === 'ALERT' };
}
