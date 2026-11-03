import { describe, expect, it } from 'vitest';
import { formatAmount, formatXAF, NNBSP, NBSP } from './money';

describe('formatXAF (spec 1.5 AmountText)', () => {
  it('formats French with a narrow no-break space between groups', () => {
    expect(formatXAF(10000, 'fr')).toBe(`10${NNBSP}000${NBSP}FCFA`);
    expect(formatXAF(11000, 'fr')).toBe(`11${NNBSP}000${NBSP}FCFA`);
    expect(formatXAF(1234567, 'fr')).toBe(`1${NNBSP}234${NNBSP}567${NBSP}FCFA`);
  });

  it('formats English with commas', () => {
    expect(formatXAF(10000, 'en')).toBe(`10,000${NBSP}FCFA`);
    expect(formatXAF(1234567, 'en')).toBe(`1,234,567${NBSP}FCFA`);
  });

  it('keeps small amounts ungrouped', () => {
    expect(formatXAF(0, 'fr')).toBe(`0${NBSP}FCFA`);
    expect(formatXAF(999, 'en')).toBe(`999${NBSP}FCFA`);
    expect(formatXAF(1000, 'fr')).toBe(`1${NNBSP}000${NBSP}FCFA`);
  });

  it('uses a real minus sign for negative amounts and an optional plus sign', () => {
    expect(formatXAF(-9909, 'fr')).toBe(`−9${NNBSP}909${NBSP}FCFA`);
    expect(formatXAF(9909, 'en', { sign: 'always' })).toBe(`+9,909${NBSP}FCFA`);
    expect(formatXAF(0, 'en', { sign: 'always' })).toBe(`0${NBSP}FCFA`);
  });

  it('can omit the currency', () => {
    expect(formatAmount(100000, 'fr')).toBe(`100${NNBSP}000`);
    expect(formatAmount(100000, 'en')).toBe('100,000');
  });

  it('refuses anything that is not a safe integer', () => {
    expect(() => formatXAF(10.5, 'fr')).toThrow();
    expect(() => formatXAF(Number.NaN, 'fr')).toThrow();
    expect(() => formatXAF(Number.MAX_SAFE_INTEGER + 1, 'fr')).toThrow();
  });
});
