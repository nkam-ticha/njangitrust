import { describe, expect, it } from 'vitest';
import { bilingual, interpolate } from './lang';
import { formatXAF } from './money';

describe('interpolate', () => {
  it('fills {{placeholders}}', () => {
    expect(interpolate('Tour {{round}} sur {{total}}', { round: 4, total: 10 })).toBe('Tour 4 sur 10');
    expect(interpolate('Bonjour {{ name }}', { name: 'Carine' })).toBe('Bonjour Carine');
  });

  it('refuses a missing parameter instead of showing "{{name}}" to a member', () => {
    expect(() => interpolate('Bonjour {{name}}', {})).toThrow(/name/);
  });
});

describe('bilingual (server-built texts, spec 2.4 *Fr / *En fields)', () => {
  it('fills each language with its own formatting of the same amount', () => {
    const text = bilingual(
      { fr: 'Paiement {{amount}} : réussi', en: 'Payment {{amount}}: successful' },
      { amount: { fr: formatXAF(11000, 'fr'), en: formatXAF(11000, 'en') } },
    );
    expect(text.fr).toBe(`Paiement ${formatXAF(11000, 'fr')} : réussi`);
    expect(text.en).toBe(`Payment ${formatXAF(11000, 'en')}: successful`);
  });

  it('uses plain values in both languages', () => {
    expect(bilingual({ fr: 'Tour {{n}}', en: 'Round {{n}}' }, { n: 4 })).toEqual({
      fr: 'Tour 4',
      en: 'Round 4',
    });
  });
});
