import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatLimitFactor, parseLimitFactor } from './factor';

describe('loan limit factor for people (3.2 loanLimitFactor, stored in permille)', () => {
  it('shows the factor with the decimal comma in French and the point in English', () => {
    expect(formatLimitFactor(1_000, 'fr')).toBe('1');
    expect(formatLimitFactor(1_500, 'fr')).toBe('1,5');
    expect(formatLimitFactor(1_500, 'en')).toBe('1.5');
    expect(formatLimitFactor(1_250, 'fr')).toBe('1,25');
    expect(formatLimitFactor(2_005, 'en')).toBe('2.005');
    expect(formatLimitFactor(0, 'fr')).toBe('0');
    expect(formatLimitFactor(3_000, 'en')).toBe('3');
    expect(() => formatLimitFactor(1.5, 'fr')).toThrow(RangeError);
  });

  it('reads "1,5", "1.5" or "2" typed in a rule change into permille', () => {
    expect(parseLimitFactor('1,5')).toEqual({ ok: true, permille: 1_500 });
    expect(parseLimitFactor('1.5')).toEqual({ ok: true, permille: 1_500 });
    expect(parseLimitFactor(' 2 ')).toEqual({ ok: true, permille: 2_000 });
    expect(parseLimitFactor('0,25')).toEqual({ ok: true, permille: 250 });
    expect(parseLimitFactor(',5')).toEqual({ ok: true, permille: 500 });
  });

  it('refuses text that is not a factor with at most three decimals', () => {
    for (const bad of ['', 'abc', '-1', '1,2345', '1,5,0', '1.5.0', '1e3', '٣']) {
      expect(parseLimitFactor(bad)).toEqual({ ok: false, code: 'INVALID_FACTOR' });
    }
  });

  it('round-trips every permille value (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3_000 }),
        fc.constantFrom('fr' as const, 'en' as const),
        (p, lang) => {
          expect(parseLimitFactor(formatLimitFactor(p, lang))).toEqual({ ok: true, permille: p });
        },
      ),
    );
  });
});
