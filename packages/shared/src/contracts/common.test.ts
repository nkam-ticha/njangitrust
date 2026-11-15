import { describe, expect, it } from 'vitest';
import { containsPhoneNumber, nameSchema, textSchema } from './common';

describe('member-visible text never carries a phone number (spec 2.11, privacy-guard M3, L6)', () => {
  it.each([
    'Appelle-moi au 677 12 34 56',
    'mon numéro: +237-699-00-11-22',
    'contact 6.77.12.34.56 ce soir',
    'numéro ６７７１２３４５６', // fullwidth digits, folded by NFKC
    'رقم ٦٧٧١٢٣٤٥٦', // Arabic-Indic digits
    // M-B: separators and invisible characters
    'Appelle 677 - 12 - 34 - 56',
    'numéro 677/123/456',
    '677_12_34_56',
    '677–123–456', // en dashes
    '(677) 123 456',
    '677​123​456', // zero-width spaces
    '677­12­34­56', // soft hyphens
  ])('refuses %s', (text) => {
    expect(containsPhoneNumber(text)).toBe(true);
    expect(textSchema(200).safeParse(text).success).toBe(false);
  });

  it.each([
    'Collègue fiable depuis 2019',
    'Amende de 1 500 FCFA trop élevée',
    'Tour 4, réunion samedi',
  ])('accepts ordinary text: %s', (text) => {
    expect(textSchema(200).safeParse(text).success).toBe(true);
  });

  it.each([
    'Réunion le 16/11/2026 12:00',
    'Échéance 16.11.2026 18:00',
    'Vote clos le 16-11-2026 18h00',
    'Tour 6, 16/11/2026 18:00',
    'Début le 2026-11-16 12:00, cotisation 25 000 FCFA',
  ])('accepts a date with a time in free text: %s', (text) => {
    expect(containsPhoneNumber(text)).toBe(false);
    expect(textSchema(200).safeParse(text).success).toBe(true);
  });

  it.each([
    '677 123 45, 6.11.2026',
    '677-123-45-6-11-2026 18:00',
    '16.11.2026, 77 12 34 56',
    'Rappel 677 12 34 56 le 16/11/2026 18:00',
  ])('still refuses a number next to a date: %s', (text) => {
    expect(containsPhoneNumber(text)).toBe(true);
  });

  it('folds compatibility characters before storing', () => {
    expect(textSchema(50).parse('  ｃａｉｓｓｅ  ')).toBe('caisse');
  });

  it('refuses digit runs in names, in any script', () => {
    expect(nameSchema().safeParse('Paul ６７７１２').success).toBe(false);
    expect(nameSchema().safeParse('Paul ٦٧٧١٢').success).toBe(false);
    expect(nameSchema().safeParse('Njangi 2026').success).toBe(true);
  });

  it.each(['Paul 677-123-456', 'Paul 677​12​34​56', 'Paul (677) 12 34 56'])(
    'refuses a name carrying a disguised number (M-B): %s',
    (name) => {
      expect(nameSchema(80).safeParse(name).success).toBe(false);
    },
  );
});
