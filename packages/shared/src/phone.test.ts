import { describe, expect, it } from 'vitest';
import {
  detectOperator,
  findPhoneNumbers,
  formatOwnNumber,
  looksLikePhoneNumber,
  maskNumber,
  maskPhonesInText,
  normalizeCameroonPhone,
} from './phone';

describe('normalizeCameroonPhone (R13.1)', () => {
  it('accepts the usual ways of typing a number and returns E.164', () => {
    expect(normalizeCameroonPhone('677 12 34 56')).toBe('+237677123456');
    expect(normalizeCameroonPhone('+237 677-12-34-56')).toBe('+237677123456');
    expect(normalizeCameroonPhone('237677123456')).toBe('+237677123456');
    expect(normalizeCameroonPhone('00237 677.12.34.56')).toBe('+237677123456');
  });

  it('refuses numbers that are not 9 digits starting with 6', () => {
    expect(normalizeCameroonPhone('577123456')).toBeNull();
    expect(normalizeCameroonPhone('67712345')).toBeNull();
    expect(normalizeCameroonPhone('6771234567')).toBeNull();
    expect(normalizeCameroonPhone('+33677123456')).toBeNull();
    expect(normalizeCameroonPhone('six sept sept')).toBeNull();
  });
});

describe('maskNumber (spec 1.5 MaskedNumber)', () => {
  it('shows the first digit and the last three', () => {
    expect(maskNumber('+237677123789')).toBe('6•• •• •7 89');
    expect(maskNumber('+237699001122')).toBe('6•• •• •1 22');
  });

  it('refuses a number that is not a stored payment number', () => {
    expect(() => maskNumber('677123789')).toThrow();
  });
});

describe('formatOwnNumber', () => {
  it('groups the owner’s full number 3-2-2-2', () => {
    expect(formatOwnNumber('+237677123456')).toBe('677 12 34 56');
  });
});

describe('detectOperator (pre-fill only; the member confirms)', () => {
  it('recognises MTN and Orange prefixes', () => {
    expect(detectOperator('+237677123456')).toBe('MTN');
    expect(detectOperator('+237650123456')).toBe('MTN');
    expect(detectOperator('+237680123456')).toBe('MTN');
    expect(detectOperator('+237699123456')).toBe('ORANGE');
    expect(detectOperator('+237655123456')).toBe('ORANGE');
    expect(detectOperator('+237640123456')).toBe('ORANGE');
  });

  it('returns UNKNOWN for other networks', () => {
    expect(detectOperator('+237662123456')).toBe('UNKNOWN');
  });
});

describe('phone patterns in free text (spec 4.8 output guard, 5.3 scans)', () => {
  const text = 'Envoie 50 000 à 677 12 34 56 ou au +237 699-00-11-22, pas à 6551234 ni au tour 6.';

  it('finds every phone number, normalised', () => {
    expect(findPhoneNumbers(text)).toEqual(['+237677123456', '+237699001122']);
  });

  it('masks every number except the member’s own', () => {
    const out = maskPhonesInText(text, ['+237699001122']);
    expect(out).toContain('6•• •• •• ••');
    expect(out).not.toMatch(/677\s?12/);
    expect(out).toContain('+237 699-00-11-22');
  });

  it('sees numbers written with full-width or other-script digits (privacy L6)', () => {
    expect(findPhoneNumbers('Appelle le ６７７ １２ ３４ ５６ ce soir')).toEqual(['+237677123456']);
    expect(findPhoneNumbers('رقم ٦٧٧١٢٣٤٥٦')).toEqual(['+237677123456']);
    expect(findPhoneNumbers('नंबर ६७७१२३४५६')).toEqual(['+237677123456']);
  });

  it('masks numbers in other digits and keeps the rest of the text intact', () => {
    const out = maskPhonesInText('Paul: ６７７ １２ ３４ ５６, Ali: ٦٩٩٠٠١١٢٢.', []);
    expect(out).toBe('Paul: 6•• •• •• ••, Ali: 6•• •• •• ••.');
  });

  it('keeps the member’s own number even when written in full-width digits', () => {
    const text = 'Mon numéro : ６７７ １２ ３４ ５６';
    expect(maskPhonesInText(text, ['+237677123456'])).toBe(text);
  });

  it('masks everything when the member has no allowed number', () => {
    expect(findPhoneNumbers(maskPhonesInText(text, []))).toEqual([]);
  });
});

describe('looksLikePhoneNumber: member text with a number in any disguise (privacy-guard M-B)', () => {
  it.each([
    ['677 - 12 - 34 - 56', 'spaced dashes'],
    ['677/123/456', 'slashes'],
    ['677_12_34_56', 'underscores'],
    ['677–123–456', 'en dashes'],
    ['677—12—34—56', 'em dashes'],
    ['677−123−456', 'minus signs'],
    ['(677) 123 456', 'parentheses'],
    ['677​123​456', 'zero-width spaces'],
    ['677­12­34­56', 'soft hyphens'],
    ['6⁦7⁩7 12 34 56', 'bidi isolates'],
    ['6⁠‍7‌7 12 34 56', 'joiners'],
    ['Appelle 677 . 12 . 34 . 56 ce soir', 'dots between spaces'],
    ['+237 / 677 / 123 / 456', 'country code and slashes'],
    ['00237-677-123-456', 'international prefix'],
    ['６７７－１２３－４５６', 'full-width digits and dashes'],
  ])('finds %s (%s)', (text) => {
    expect(looksLikePhoneNumber(text)).toBe(true);
  });

  it.each([
    'Tour 6, réunion samedi',
    'Amende de 1 500 FCFA trop élevée',
    'Cotisation de 25 000 FCFA au tour 4',
    'Réunion le 12/11/2026 chez Carine',
    '6 membres ont voté',
    '1 000 000 FCFA',
  ])('leaves ordinary text alone: %s', (text) => {
    expect(looksLikePhoneNumber(text)).toBe(false);
  });

  it('does not change what findPhoneNumbers reports', () => {
    expect(findPhoneNumbers('677/123/456')).toEqual([]);
    expect(findPhoneNumbers('677 12 34 56')).toEqual(['+237677123456']);
  });
});
