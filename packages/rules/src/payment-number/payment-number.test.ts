import { describe, expect, it } from 'vitest';
import {
  canChangePaymentNumber,
  detectOperator,
  normalizePaymentNumber,
  validatePaymentNumber,
} from './payment-number';

describe('payment numbers (R13.1)', () => {
  it('stores 9 digits starting with 6 as +2376XXXXXXXX, whatever the input format', () => {
    for (const input of [
      '677123456',
      '677 12 34 56',
      '+237 677 12 34 56',
      '237677123456',
      '00237677123456',
      '677.12.34.56',
      '677-12-34-56',
    ]) {
      expect(normalizePaymentNumber(input)).toBe('+237677123456');
    }
  });

  it('refuses numbers that are not Cameroon mobile numbers', () => {
    for (const input of ['577123456', '67712345', '6771234567', '+33677123456', 'abc', '']) {
      expect(normalizePaymentNumber(input)).toBeNull();
    }
  });

  it('guesses MTN or Orange from the prefix, UNKNOWN otherwise', () => {
    expect(detectOperator('+237677123456')).toBe('MTN');
    expect(detectOperator('+237650123456')).toBe('MTN');
    expect(detectOperator('+237683123456')).toBe('MTN');
    expect(detectOperator('+237699001122')).toBe('ORANGE');
    expect(detectOperator('+237655443322')).toBe('ORANGE');
    expect(detectOperator('+237640123456')).toBe('ORANGE');
    expect(detectOperator('+237662123456')).toBe('UNKNOWN');
  });

  it('accepts MTN or Orange numbers and refuses an operator that contradicts the prefix', () => {
    expect(validatePaymentNumber({ input: '677 12 34 56', operator: 'MTN' })).toEqual({
      ok: true,
      e164: '+237677123456',
      operator: 'MTN',
    });
    expect(validatePaymentNumber({ input: '677 12 34 56', operator: 'ORANGE' })).toEqual({
      ok: false,
      code: 'OPERATOR_MISMATCH',
      detected: 'MTN',
    });
    expect(validatePaymentNumber({ input: '662 12 34 56', operator: 'ORANGE' })).toMatchObject({
      ok: true,
    });
    expect(validatePaymentNumber({ input: '12345', operator: 'MTN' })).toEqual({
      ok: false,
      code: 'INVALID_PAYMENT_NUMBER',
    });
  });
});

describe('who can change a payment number (R13.2, R13.7)', () => {
  it('lets only the member change their own number', () => {
    expect(canChangePaymentNumber({ actorUserId: 'u1', ownerUserId: 'u1' })).toEqual({ ok: true });
    expect(canChangePaymentNumber({ actorUserId: 'admin', ownerUserId: 'u1' })).toEqual({
      ok: false,
      code: 'ONLY_OWNER_CAN_CHANGE_NUMBER',
    });
  });
});
