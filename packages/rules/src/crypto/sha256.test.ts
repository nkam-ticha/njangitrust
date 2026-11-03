import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sha256Hex, utf8Encode } from './sha256';

const nodeSha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('sha256Hex (pure TypeScript, platform-neutral)', () => {
  it('matches the FIPS 180-2 test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(sha256Hex('a'.repeat(1_000_000))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  it('matches node:crypto around the padding boundaries', () => {
    for (let n = 0; n <= 130; n++) {
      const s = 'x'.repeat(n);
      expect(sha256Hex(s)).toBe(nodeSha(s));
    }
  });

  it('matches node:crypto for French text and emoji (UTF-8)', () => {
    for (const s of ['Cotisation reçue', 'Bénéficiaire : Carine', '€ 💸 FCFA', 'njangitrust:é']) {
      expect(sha256Hex(s)).toBe(nodeSha(s));
    }
  });

  it('matches node:crypto for any string (property)', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 300 }), (s) => {
        expect(sha256Hex(s)).toBe(nodeSha(s));
      }),
      { numRuns: 300 },
    );
  });

  it('hashes bytes as well as strings', () => {
    expect(sha256Hex(new Uint8Array([0x61, 0x62, 0x63]))).toBe(sha256Hex('abc'));
  });
});

describe('utf8Encode', () => {
  it('encodes like Buffer.from(s, "utf8"), lone surrogates as U+FFFD', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 200 }), (s) => {
        expect(Array.from(utf8Encode(s))).toEqual(Array.from(Buffer.from(s, 'utf8')));
      }),
    );
    expect(Array.from(utf8Encode('\ud800'))).toEqual([0xef, 0xbf, 0xbd]);
  });
});
