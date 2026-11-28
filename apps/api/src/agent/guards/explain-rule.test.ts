import { describe, expect, it } from 'vitest';
import { asksWhyARuleApplies, skippedExplainRule } from './explain-rule';

describe('asksWhyARuleApplies (system prompt rule 7)', () => {
  it.each([
    ['Pourquoi j’ai une amende ?', true],
    ['Pourquoi cette dette sur mon compte ?', true],
    ['Why was I fined?', true],
    ['Why do I owe a fine for round 3?', true],
    ['Combien est mon amende ?', false],
    ['Pourquoi le groupe est fermé ?', false],
    ['Je dois combien ?', false],
  ])('%j -> %s', (text, expected) => {
    expect(asksWhyARuleApplies(text)).toBe(expected);
  });
});

describe('skippedExplainRule', () => {
  const run = (name: string, status = 'OK') => ({ name, status });
  it('is true when the ledger was read for a why-question and the rule text was not', () => {
    expect(skippedExplainRule('Pourquoi j’ai une amende ?', [run('get_ledger')])).toBe(true);
  });
  it('is false once explain_rule ran, when no ledger was read, or for another question', () => {
    expect(
      skippedExplainRule('Pourquoi j’ai une amende ?', [run('get_ledger'), run('explain_rule')]),
    ).toBe(false);
    expect(skippedExplainRule('Pourquoi j’ai une amende ?', [])).toBe(false);
    expect(skippedExplainRule('Je dois combien ?', [run('get_ledger')])).toBe(false);
  });
});
