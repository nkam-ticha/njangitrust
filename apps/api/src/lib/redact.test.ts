import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { redact, redactText, REDACTED } from './redact';

describe('log redaction (CLAUDE.md rule 11, spec 2.15)', () => {
  it('replaces PINs, tokens, cookies, authorization headers and phone fields', () => {
    const out = redact({
      pin: '258147',
      newPin: '904713',
      refreshToken: 'abc',
      accessToken: 'def',
      headers: { authorization: 'Bearer x.y.z', cookie: 'njangi_rt=secret', 'set-cookie': ['a=b'] },
      phone: '+237677123456',
      paymentNumber: '+237699001122',
      phoneSnapshot: '+237677123456',
      link: 'https://x/invite/token',
      keep: 'visible',
    });
    expect(out).toEqual({
      pin: REDACTED,
      newPin: REDACTED,
      refreshToken: REDACTED,
      accessToken: REDACTED,
      headers: { authorization: REDACTED, cookie: REDACTED, 'set-cookie': REDACTED },
      phone: REDACTED,
      paymentNumber: REDACTED,
      phoneSnapshot: REDACTED,
      link: REDACTED,
      keep: 'visible',
    });
  });

  it('masks phone numbers inside free text, in every spelling', () => {
    const text = redactText('Envoie 50 000 à 677 12 34 56, ou +237 699-00-11-22, ou 237655443322.');
    expect(text).not.toMatch(/677|699|655/);
  });

  it('masks JWTs, bearer tokens and long opaque tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlc2lnbmF0dXJl';
    const link = `/v1/auth/invites/${'A'.repeat(43)}`;
    expect(redactText(`token ${jwt}`)).toBe('token [jwt]');
    expect(redactText('Authorization: Bearer abc.def')).toBe('Authorization: Bearer [redacted]');
    expect(redactText(link)).toBe('/v1/auth/invites/[token]');
  });

  it('masks phone numbers stored as numbers and phone-like keys (L7)', () => {
    const out = redact({
      msisdn2: 237677123456,
      n: 677123456,
      count: 3,
      phoneNumber: 'x',
      tel: 'x',
      mobile: 'x',
    });
    expect(out).toEqual({
      msisdn2: REDACTED,
      n: REDACTED,
      count: 3,
      phoneNumber: REDACTED,
      tel: REDACTED,
      mobile: REDACTED,
    });
  });

  it('keeps UUIDs readable', () => {
    const id = '2f1d6123-4567-4891-a234-612345678901';
    expect(redactText(id)).toBe(id);
  });

  it('redacts errors, nested values and circular objects without throwing', () => {
    const err = new Error('Payment refused for 677123456');
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    const out = redact({ err, circular }) as unknown as {
      err: { message: string };
      circular: { self: unknown };
    };
    expect(out.err.message).not.toContain('677123456');
    expect(out.circular.self).toBe('[circular]');
  });

  it('applies to real pino output', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const log = pino({ formatters: { log: (o) => redact(o) } }, sink);
    log.info({ body: { phone: '+237677123456', note: 'appelle 677123456' } }, 'test');
    expect(lines.join('')).not.toMatch(/677123456|677 12/);
  });

  it('masks a number split by several separators, and leaves amounts and dates alone', () => {
    for (const text of [
      '677----12----34----57',
      '677 .. 12 .. 34 .. 57',
      '+237 6 | 7 | 7 / 12 34 57',
    ]) {
      expect(redactText(`appel ${text} fait`)).not.toMatch(/677|12 .. 34/);
    }
    expect(redactText('Paiement de 12 000 FCFA le 17/11/2026 à 07:48')).toContain('12 000 FCFA');
    expect(redactText('Paiement de 12 000 FCFA le 17/11/2026 à 07:48')).toContain('17/11/2026');
  });
});
