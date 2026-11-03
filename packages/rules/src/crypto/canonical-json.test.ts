import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalJSON } from './canonical-json';

describe('canonicalJSON (2.5 invariant 5, D6)', () => {
  it('sorts keys at every level and has no whitespace', () => {
    expect(canonicalJSON({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}',
    );
  });

  it('writes dates as ISO 8601 UTC strings', () => {
    expect(canonicalJSON({ at: new Date(Date.UTC(2026, 10, 28, 17, 0, 0)) })).toBe(
      '{"at":"2026-11-28T17:00:00.000Z"}',
    );
  });

  it('accepts integers only', () => {
    expect(canonicalJSON([0, -5, 9_007_199_254_740_991])).toBe('[0,-5,9007199254740991]');
    expect(canonicalJSON(-0)).toBe('0');
    expect(() => canonicalJSON({ a: 1.5 })).toThrow(TypeError);
    expect(() => canonicalJSON({ a: Number.NaN })).toThrow(TypeError);
    expect(() => canonicalJSON({ a: 2 ** 60 })).toThrow(TypeError);
    expect(() => canonicalJSON({ a: 1n })).toThrow(TypeError);
  });

  it('refuses undefined, functions and invalid dates instead of dropping them', () => {
    expect(() => canonicalJSON({ a: undefined })).toThrow(TypeError);
    expect(() => canonicalJSON([undefined])).toThrow(TypeError);
    expect(() => canonicalJSON({ f: () => 1 })).toThrow(TypeError);
    expect(() => canonicalJSON(new Date(Number.NaN))).toThrow(TypeError);
  });

  it('escapes strings exactly like JSON.stringify', () => {
    const s = 'Cotisation "tour 4"\n\u0000 é 💸 \\';
    expect(canonicalJSON(s)).toBe(JSON.stringify(s));
  });

  it('is independent of key insertion order and round-trips through JSON.parse (property)', () => {
    const json = fc.letrec((tie) => ({
      value: fc.oneof(
        { depthSize: 'small' },
        fc.constant(null),
        fc.boolean(),
        fc.integer(),
        fc.string(),
        fc.array(tie('value'), { maxLength: 4 }),
        fc.dictionary(fc.string({ maxLength: 6 }), tie('value'), { maxKeys: 5 }),
      ),
    })).value;
    fc.assert(
      fc.property(json, (v) => {
        const text = canonicalJSON(v);
        const reparsed = JSON.parse(text) as unknown;
        expect(canonicalJSON(reparsed)).toBe(text);
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          const reversed = Object.fromEntries(Object.entries(v).reverse());
          expect(canonicalJSON(reversed)).toBe(text);
        }
      }),
    );
  });
});
