import { describe, expect, it } from 'vitest';
import { applyProviderStatus, nextStatusCheck, retryDecision, statusCheckTimes } from './status';

const start = new Date('2026-11-20T10:00:00.000Z');
const after = (seconds: number) => new Date(start.getTime() + seconds * 1000);

describe('when an operation status is checked (spec 2.6 rule 4)', () => {
  it('polls at 5, 10 and 20 s, then every 30 s up to 10 min, then hourly for 24 h', () => {
    const offsets = statusCheckTimes(start).map((t) => (t.getTime() - start.getTime()) / 1000);
    expect(offsets.slice(0, 5)).toEqual([5, 15, 35, 65, 95]);
    expect(offsets).toContain(575);
    expect(offsets).toContain(600); // the final check at 10 minutes
    expect(offsets.filter((s) => s > 600)).toEqual(
      Array.from({ length: 24 }, (_, i) => (i + 1) * 3_600),
    );
    expect(new Set(offsets).size).toBe(offsets.length);
  });

  it('gives the next check strictly after now, and none after 24 h', () => {
    expect(nextStatusCheck(start, start)).toEqual(after(5));
    expect(nextStatusCheck(start, after(5))).toEqual(after(15));
    expect(nextStatusCheck(start, after(590))).toEqual(after(600));
    expect(nextStatusCheck(start, after(600))).toEqual(after(3_600));
    expect(nextStatusCheck(start, after(86_400))).toBeNull();
  });
});

describe('what a provider status means for our operation (spec 2.6 rules 3 and 4)', () => {
  const base = { startedAt: start };

  it('records a success or a failure once, and ignores a duplicate answer', () => {
    expect(
      applyProviderStatus({ ...base, current: 'PENDING', reported: 'SUCCESSFUL', now: after(30) }),
    ).toEqual({ status: 'SUCCESSFUL', record: 'SUCCESS', nextCheckAt: null, conflict: false });
    expect(
      applyProviderStatus({
        ...base,
        current: 'SUCCESSFUL',
        reported: 'SUCCESSFUL',
        now: after(40),
      }),
    ).toEqual({ status: 'SUCCESSFUL', record: 'NONE', nextCheckAt: null, conflict: false });
    expect(
      applyProviderStatus({ ...base, current: 'PENDING', reported: 'FAILED', now: after(30) }),
    ).toEqual({ status: 'FAILED', record: 'FAILURE', nextCheckAt: null, conflict: false });
  });

  it('flags a final status the provider later contradicts (a reversal to handle, never a second record)', () => {
    expect(
      applyProviderStatus({ ...base, current: 'SUCCESSFUL', reported: 'FAILED', now: after(90) }),
    ).toEqual({ status: 'SUCCESSFUL', record: 'NONE', nextCheckAt: null, conflict: true });
  });

  it('expires after 10 minutes still pending, keeps checking hourly, and settles late', () => {
    expect(
      applyProviderStatus({ ...base, current: 'PENDING', reported: 'PENDING', now: after(65) }),
    ).toEqual({ status: 'PENDING', record: 'NONE', nextCheckAt: after(95), conflict: false });
    expect(
      applyProviderStatus({ ...base, current: 'PENDING', reported: 'PENDING', now: after(600) }),
    ).toEqual({ status: 'EXPIRED', record: 'NONE', nextCheckAt: after(3_600), conflict: false });
    expect(
      applyProviderStatus({
        ...base,
        current: 'EXPIRED',
        reported: 'SUCCESSFUL',
        now: after(7_200),
      }),
    ).toMatchObject({ status: 'SUCCESSFUL', record: 'SUCCESS' });
    expect(
      applyProviderStatus({ ...base, current: 'EXPIRED', reported: 'PENDING', now: after(86_400) }),
    ).toEqual({ status: 'EXPIRED', record: 'NONE', nextCheckAt: null, conflict: false });
  });
});

describe('a retry only after a fresh status check (CLAUDE.md rule 8, PAY-05)', () => {
  it('refuses without a fresh check, while pending, and after a success', () => {
    expect(retryDecision({ status: 'FAILED', checkedJustNow: false })).toEqual({
      ok: false,
      code: 'CHECK_STATUS_FIRST',
    });
    for (const status of ['CREATED', 'PENDING', 'EXPIRED'] as const)
      expect(retryDecision({ status, checkedJustNow: true })).toEqual({
        ok: false,
        code: 'OPERATION_STILL_PENDING',
      });
    expect(retryDecision({ status: 'SUCCESSFUL', checkedJustNow: true })).toEqual({
      ok: false,
      code: 'ALREADY_SUCCEEDED',
    });
    expect(retryDecision({ status: 'FAILED', checkedJustNow: true })).toEqual({ ok: true });
  });
});
