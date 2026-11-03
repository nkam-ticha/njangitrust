import { describe, expect, it } from 'vitest';
import { amountToWords } from './amountWords';

const fr = (n: number) => amountToWords(n, 'fr');
const en = (n: number) => amountToWords(n, 'en');

describe('amountToWords, French (screen readers, spec 1.7)', () => {
  it('reads the spec example', () => {
    expect(fr(11000)).toBe('onze mille francs CFA');
  });

  it('handles et, hyphens and the 70/80/90 forms', () => {
    expect(fr(21)).toBe('vingt et un francs CFA');
    expect(fr(17)).toBe('dix-sept francs CFA');
    expect(fr(70)).toBe('soixante-dix francs CFA');
    expect(fr(71)).toBe('soixante et onze francs CFA');
    expect(fr(77)).toBe('soixante-dix-sept francs CFA');
    expect(fr(80)).toBe('quatre-vingts francs CFA');
    expect(fr(81)).toBe('quatre-vingt-un francs CFA');
    expect(fr(91)).toBe('quatre-vingt-onze francs CFA');
  });

  it('pluralises cent and vingt only when final, never before mille', () => {
    expect(fr(100)).toBe('cent francs CFA');
    expect(fr(200)).toBe('deux cents francs CFA');
    expect(fr(201)).toBe('deux cent un francs CFA');
    expect(fr(80000)).toBe('quatre-vingt mille francs CFA');
    expect(fr(200000)).toBe('deux cent mille francs CFA');
  });

  it('says mille, not un mille, and keeps mille invariable', () => {
    expect(fr(1000)).toBe('mille francs CFA');
    expect(fr(1001)).toBe('mille un francs CFA');
    expect(fr(3000)).toBe('trois mille francs CFA');
  });

  it('uses "de" after a final million or milliard', () => {
    expect(fr(1000000)).toBe('un million de francs CFA');
    expect(fr(2000000)).toBe('deux millions de francs CFA');
    expect(fr(280000000)).toBe('deux cent quatre-vingts millions de francs CFA');
    expect(fr(2500000)).toBe('deux millions cinq cent mille francs CFA');
    expect(fr(1000000000)).toBe('un milliard de francs CFA');
  });

  it('reads ledger-sized amounts and the singular', () => {
    expect(fr(99090)).toBe('quatre-vingt-dix-neuf mille quatre-vingt-dix francs CFA');
    expect(fr(0)).toBe('zéro franc CFA');
    expect(fr(1)).toBe('un franc CFA');
    expect(fr(-9909)).toBe('moins neuf mille neuf cent neuf francs CFA');
  });
});

describe('amountToWords, English', () => {
  it('reads amounts', () => {
    expect(en(11000)).toBe('eleven thousand CFA francs');
    expect(en(99090)).toBe('ninety-nine thousand ninety CFA francs');
    expect(en(1234567)).toBe(
      'one million two hundred thirty-four thousand five hundred sixty-seven CFA francs',
    );
    expect(en(1)).toBe('one CFA franc');
    expect(en(0)).toBe('zero CFA francs');
    expect(en(-500)).toBe('minus five hundred CFA francs');
  });

  it('refuses non-integers', () => {
    expect(() => en(1.5)).toThrow();
  });
});
