// Every ledger type the API can write has a glyph (LED-01): the six newer ones no longer read as a
// vote result.
import { describe, expect, it } from 'vitest';
import { ledgerTypeOf } from './ledgerTypes';

const API_TYPES = [
  'PAYMENT_RECEIVED',
  'FINE_ASSESSED',
  'BID_ASSESSED',
  'AUTO_SETTLEMENT',
  'WITHDRAWAL_COMPLETED',
  'LOAN_DISBURSED',
  'SOLIDARITY_DISBURSED',
  'LEAVER_REFUND',
  'FUND_DISTRIBUTION',
  'POT_ASSIGNED',
  'POT_CORRECTION',
  'CLAWBACK',
  'CLAWBACK_RELEASE',
  'DISBURSEMENT_SENT',
  'DISBURSEMENT_RETURNED',
  'DISBURSEMENT_REFUNDED',
  'REVERSAL',
  'EVENT',
];

describe('ledgerTypeOf', () => {
  it('keeps a covered type and maps the others to the nearest glyph', () => {
    expect(ledgerTypeOf('SOLIDARITY_DISBURSED')).toBe('SOLIDARITY_DISBURSED');
    expect(ledgerTypeOf('DISBURSEMENT_SENT')).toBe('WITHDRAWAL_COMPLETED');
    expect(ledgerTypeOf('CLAWBACK')).toBe('REVERSAL');
    expect(ledgerTypeOf('POT_ASSIGNED')).toBe('AUTO_SETTLEMENT');
  });

  it('only a governance EVENT reads as a decision', () => {
    for (const type of API_TYPES) {
      if (type !== 'EVENT') expect(ledgerTypeOf(type)).not.toBe('EVENT');
    }
    expect(ledgerTypeOf('EVENT')).toBe('EVENT');
    expect(ledgerTypeOf('SOMETHING_NEW')).toBe('EVENT');
  });
});
