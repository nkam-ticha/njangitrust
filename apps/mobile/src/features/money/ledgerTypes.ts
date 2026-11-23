// Which glyph a ledger entry gets (spec 1.4, 2.5). Pure, so it is unit-tested.
import type { LedgerType } from '@/ui';

/** The types the designer's glyphs cover (DESIGN_SYSTEM.md 5.19). */
const COVERED: readonly LedgerType[] = [
  'PAYMENT_RECEIVED',
  'FINE_ASSESSED',
  'BID_ASSESSED',
  'AUTO_SETTLEMENT',
  'WITHDRAWAL_COMPLETED',
  'LOAN_DISBURSED',
  'SOLIDARITY_DISBURSED',
  'LEAVER_REFUND',
  'FUND_DISTRIBUTION',
  'REVERSAL',
  'EVENT',
];

/**
 * The ledger types the glyphs do not cover (D10, D15, D17, D18.1, D22.1), shown with the nearest
 * one: money sent out reads as a payout, corrections as a reversal.
 */
const NEAREST_TYPE: Record<string, LedgerType> = {
  DISBURSEMENT_SENT: 'WITHDRAWAL_COMPLETED',
  DISBURSEMENT_RETURNED: 'REVERSAL',
  DISBURSEMENT_REFUNDED: 'REVERSAL',
  CLAWBACK: 'REVERSAL',
  CLAWBACK_RELEASE: 'REVERSAL',
  POT_CORRECTION: 'REVERSAL',
  POT_ASSIGNED: 'AUTO_SETTLEMENT',
};

/** The type's own glyph, else the nearest one, else "decision". */
export function ledgerTypeOf(type: string): LedgerType {
  if ((COVERED as readonly string[]).includes(type)) return type as LedgerType;
  return NEAREST_TYPE[type] ?? 'EVENT';
}
