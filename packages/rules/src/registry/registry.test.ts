import { describe, expect, it } from 'vitest';
import { findRules, getRule, RULE_REGISTRY } from './registry';

const EXPECTED_IDS = [
  ...['3.1', '3.2', '3.3'],
  ...[1, 2, 3, 4, 5, 6].map((n) => `R1.${n}`),
  ...[1, 2, 3, 4, 5].map((n) => `R2.${n}`),
  ...[1, 2, 3, 4, 5, 6].map((n) => `R3.${n}`),
  ...[1, 2, 3, 4, 5].map((n) => `R4.${n}`),
  ...[1, 2, 3, 4, 5, 6].map((n) => `R5.${n}`),
  ...[1, 2, 3, 4].map((n) => `R6.${n}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `R7.${n}`),
  ...[1, 2, 3, 4, 5, 6].map((n) => `R8.${n}`),
  ...[1, 2, 3, 4].map((n) => `R9.${n}`),
  ...[1, 2, 3, 4, 5].map((n) => `R10.${n}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `R11.${n}`),
  ...[1, 2, 3, 4].map((n) => `R12.${n}`),
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => `R13.${n}`),
  ...[1, 2, 3].map((n) => `R14.${n}`),
  ...[1, 2, 3, 4, 5].map((n) => `R15.${n}`),
];

describe('rules registry (spec 4.9 "Explaining rules")', () => {
  it('holds every rule of Part 3, R1 to R15, once', () => {
    expect(RULE_REGISTRY.map((r) => r.id)).toEqual(EXPECTED_IDS);
  });

  it('has a title and an official text in French and English for every rule, and topics', () => {
    for (const rule of RULE_REGISTRY) {
      for (const lang of ['fr', 'en'] as const) {
        expect(rule.title[lang].length, `${rule.id} ${lang}`).toBeGreaterThan(2);
        expect(rule.text[lang].length, `${rule.id} ${lang}`).toBeGreaterThan(20);
      }
      expect(rule.topics.length, rule.id).toBeGreaterThan(0);
    }
  });

  it('returns a rule by its id, whatever the spelling', () => {
    expect(getRule('R7.3')?.text.en).toContain('round half up');
    expect(getRule('r7.3')?.id).toBe('R7.3');
    expect(getRule('7.3')?.id).toBe('R7.3');
    expect(getRule('R99.1')).toBeNull();
  });

  it('finds rules by topic in French or English, accents optional', () => {
    expect(findRules('amende')[0]?.id).toMatch(/^R6\./);
    expect(findRules('fine').map((r) => r.id)).toContain('R6.1');
    expect(findRules('pret')[0]?.id).toMatch(/^R7\./);
    expect(findRules('retrait').map((r) => r.id)).toContain('R5.4');
    expect(findRules('vote secret').map((r) => r.id)).toContain('R11.5');
    expect(findRules('numéro de paiement').map((r) => r.id)).toContain('R13.1');
    expect(findRules('caisse de secours').map((r) => r.id)).toContain('R10.1');
    expect(findRules('enchère')[0]?.id).toMatch(/^R8\./);
    expect(findRules('R5.3').map((r) => r.id)).toEqual(['R5.3']);
    expect(findRules('zzzz')).toEqual([]);
  });

  it('uses the group vocabulary in French and keeps "tu" when it speaks to the member', () => {
    const fr = RULE_REGISTRY.map((r) => r.text.fr).join(' ');
    for (const word of [
      'cotisation',
      'tour',
      'bénéficiaire',
      'caisse générale',
      'caisse de secours',
      'amende',
      'prêt',
      'enchère',
      'registre',
      'procès-verbal',
    ]) {
      expect(fr, word).toContain(word);
    }
    expect(fr).not.toMatch(/\bvous\b/i);
  });
});
