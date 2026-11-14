import { describe, expect, it } from 'vitest';
import { openJson, sealJson } from './crypto';

describe('sealed values (R11.5, privacy-guard M2)', () => {
  it('round-trips a value', () => {
    const value = { choice: 'YES', proposalId: 'p', note: 'é' };
    expect(openJson(sealJson(value))).toEqual(value);
  });

  it('hides the length of what is sealed: a YES card and a NO card seal to the same size', () => {
    const yes = sealJson({ title: { fr: 'Voter oui', en: 'Vote yes' }, choice: 'YES' });
    const no = sealJson({ title: { fr: 'Voter non', en: 'Vote no' }, choice: 'NO' });
    expect(yes.length).toBe(no.length);
    expect(sealJson({ a: 'x' }).length).toBe(sealJson({ a: 'x'.repeat(300) }).length);
    // L-1: one fixed size, so no title length moves a card across a block boundary.
    expect(sealJson({ a: 'x' }).length).toBe(sealJson({ a: 'é'.repeat(1_500) }).length);
  });

  it('never seals the same value to the same text', () => {
    expect(sealJson({ a: 1 })).not.toBe(sealJson({ a: 1 }));
  });

  it('refuses a tampered value', () => {
    const sealed = sealJson({ a: 1 });
    const parts = sealed.split('.');
    parts[3] = `${parts[3]!.slice(0, -2)}AA`;
    expect(() => openJson(parts.join('.'))).toThrow();
  });
});
