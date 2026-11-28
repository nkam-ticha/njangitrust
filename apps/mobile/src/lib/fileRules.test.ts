import { describe, expect, it } from 'vitest';
import { SHARE_LIMIT, exceedsShareLimit, ledgerFilename } from './fileRules';

describe('delivering a file', () => {
  it('names the ledger export after the day in Cameroon and the format', () => {
    // 23:30 UTC on 23 November is already 24 November in Douala (UTC+1).
    expect(ledgerFilename('json', new Date('2026-11-23T23:30:00Z'))).toBe(
      'njangi-registre-2026-11-24.json',
    );
    expect(ledgerFilename('csv', new Date('2026-03-05T10:00:00Z'))).toBe(
      'njangi-registre-2026-03-05.csv',
    );
  });

  it('refuses to hand a phone more text than a share can carry', () => {
    expect(exceedsShareLimit('android', SHARE_LIMIT.android!)).toBe(false);
    expect(exceedsShareLimit('android', SHARE_LIMIT.android! + 1)).toBe(true);
    expect(exceedsShareLimit('ios', SHARE_LIMIT.android! + 1)).toBe(false);
    expect(exceedsShareLimit('ios', SHARE_LIMIT.ios! + 1)).toBe(true);
    // An unknown system gets the strictest limit.
    expect(exceedsShareLimit('windows', SHARE_LIMIT.android! + 1)).toBe(true);
  });
});
