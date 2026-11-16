// The meeting rules that need no database: the windows of R15.3, the publication rules of R15.4 and
// the hash of the minutes.
import { describe, expect, it } from 'vitest';
import {
  agendaDueAt,
  agendaItemRefusal,
  checkInRefusal,
  closeRefusal,
  draftRefusal,
  excuseRefusal,
  markRefusal,
  publishRefusal,
  scheduleRefusal,
} from './meetings.guards';
import { appendVersion, minutesHash, readVersions, versionIsIntact } from './minutes-store';

const START = new Date('2026-12-05T15:00:00.000Z');
const at = (hoursFromStart: number) => new Date(START.getTime() + hoursFromStart * 3_600_000);

describe('scheduling (R15.1)', () => {
  const now = new Date('2026-12-01T08:00:00.000Z');
  it('needs a future date within a year', () => {
    expect(scheduleRefusal(START, now)).toBeNull();
    expect(scheduleRefusal(now, now)).toBe('MEETING_IN_THE_PAST');
    expect(scheduleRefusal(new Date('2028-01-01T00:00:00.000Z'), now)).toBe('MEETING_TOO_FAR');
  });
  it('generates the agenda 24 hours before the start (R15.2)', () => {
    expect(agendaDueAt(START).toISOString()).toBe('2026-12-04T15:00:00.000Z');
  });
});

describe('check-in (R15.3): from 1 hour before to 2 hours after the start', () => {
  const ask = (h: number, over: object = {}) =>
    checkInRefusal({
      status: 'SCHEDULED',
      scheduledAt: START,
      now: at(h),
      alreadyPresent: false,
      ...over,
    });
  it('is open inside the window, closed outside it', () => {
    expect(ask(-1)).toBeNull();
    expect(ask(0)).toBeNull();
    expect(ask(1.99)).toBeNull();
    expect(ask(-1.01)).toBe('CHECK_IN_NOT_OPEN_YET');
    expect(ask(2)).toBe('CHECK_IN_CLOSED');
  });
  it('refuses a second check-in and a meeting that is not scheduled', () => {
    expect(ask(0, { alreadyPresent: true })).toBe('ALREADY_CHECKED_IN');
    expect(ask(0, { status: 'CANCELLED' })).toBe('MEETING_NOT_SCHEDULED');
    expect(ask(0, { status: 'HELD' })).toBe('MEETING_NOT_SCHEDULED');
  });
});

describe('excuses (R15.3, R6.3): only before the start', () => {
  const ask = (h: number, over: object = {}) =>
    excuseRefusal({
      status: 'SCHEDULED',
      scheduledAt: START,
      now: at(h),
      alreadyPresent: false,
      ...over,
    });
  it('accepts an excuse until the start, not at or after it', () => {
    expect(ask(-30)).toBeNull();
    expect(ask(-0.01)).toBeNull();
    expect(ask(0)).toBe('EXCUSE_TOO_LATE');
    expect(ask(1)).toBe('EXCUSE_TOO_LATE');
  });
  it('is useless for a member already marked present', () => {
    expect(ask(-1, { alreadyPresent: true })).toBe('ALREADY_PRESENT');
  });
});

describe('agenda items, attendance marks, closing', () => {
  it('lets members add items until the start, at most 30', () => {
    const ask = (h: number, memberItems = 0) =>
      agendaItemRefusal({ status: 'SCHEDULED', scheduledAt: START, now: at(h), memberItems });
    expect(ask(-24)).toBeNull();
    expect(ask(0)).toBe('AGENDA_CLOSED');
    expect(ask(-24, 29)).toBeNull();
    expect(ask(-24, 30)).toBe('AGENDA_FULL');
  });
  it('lets the admin mark attendance from the opening of check-in', () => {
    const ask = (h: number, status: 'SCHEDULED' | 'HELD' = 'SCHEDULED') =>
      markRefusal({ status, scheduledAt: START, now: at(h) });
    expect(ask(-2)).toBe('MARK_NOT_ALLOWED');
    expect(ask(-1)).toBeNull();
    expect(ask(5)).toBeNull();
    expect(ask(5, 'HELD')).toBe('MEETING_NOT_SCHEDULED');
  });
  it('closes once, after the start', () => {
    const ask = (h: number, status: 'SCHEDULED' | 'HELD' | 'CANCELLED' = 'SCHEDULED') =>
      closeRefusal({ status, scheduledAt: START, now: at(h) });
    expect(ask(-0.5)).toBe('MEETING_NOT_STARTED');
    expect(ask(0)).toBeNull();
    expect(ask(3, 'HELD')).toBe('MEETING_ALREADY_CLOSED');
    expect(ask(3, 'CANCELLED')).toBe('MEETING_NOT_SCHEDULED');
  });
  it('drafts minutes only for a meeting that has started', () => {
    expect(draftRefusal({ status: 'SCHEDULED', scheduledAt: START, now: at(-1) })).toBe(
      'MEETING_NOT_STARTED',
    );
    expect(draftRefusal({ status: 'SCHEDULED', scheduledAt: START, now: at(1) })).toBeNull();
    expect(draftRefusal({ status: 'HELD', scheduledAt: START, now: at(8) })).toBeNull();
    expect(draftRefusal({ status: 'CANCELLED', scheduledAt: START, now: at(8) })).toBe(
      'MEETING_NOT_SCHEDULED',
    );
  });
});

describe('publishing minutes (R15.4)', () => {
  it('needs a closed meeting; the first publication needs no reason', () => {
    expect(publishRefusal({ status: 'SCHEDULED', latestText: null, text: 'a', reason: null })).toBe(
      'MEETING_NOT_CLOSED',
    );
    expect(
      publishRefusal({ status: 'HELD', latestText: null, text: 'a', reason: null }),
    ).toBeNull();
  });
  it('allows only corrections afterwards: a reason and a different text', () => {
    expect(publishRefusal({ status: 'HELD', latestText: 'a', text: 'b', reason: null })).toBe(
      'CORRECTION_REASON_REQUIRED',
    );
    expect(publishRefusal({ status: 'HELD', latestText: 'a', text: 'a', reason: 'faute' })).toBe(
      'MINUTES_UNCHANGED',
    );
    expect(
      publishRefusal({ status: 'HELD', latestText: 'a', text: 'b', reason: 'faute' }),
    ).toBeNull();
  });
});

describe('the minutes store and hash', () => {
  const base = {
    meetingId: 'm1',
    text: 'Procès-verbal',
    correctionReason: null,
    publishedAt: '2026-12-05T20:00:00.000Z',
  };
  const entry = (version: number, text = base.text, reason: string | null = null) => ({
    version,
    text,
    correctionReason: reason,
    publishedAt: base.publishedAt,
    publishedByMembershipId: '11111111-1111-4111-8111-111111111111',
    hash: minutesHash({ ...base, version, text, correctionReason: reason }),
  });

  it('hashes with SHA-256 over canonical JSON, so any change of the text changes it', () => {
    const h = minutesHash({ ...base, version: 1 });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(minutesHash({ ...base, version: 1 })).toBe(h);
    expect(minutesHash({ ...base, version: 1, text: 'Procès-verbal.' })).not.toBe(h);
    expect(minutesHash({ ...base, version: 2 })).not.toBe(h);
    expect(minutesHash({ ...base, version: 1, correctionReason: 'x' })).not.toBe(h);
  });

  it('only appends, with consecutive versions, and keeps every version', () => {
    let stored: string | null = null;
    expect(readVersions(stored)).toEqual([]);
    stored = appendVersion(stored, entry(1));
    stored = appendVersion(stored, entry(2, 'Corrigé', 'Faute de frappe'));
    expect(readVersions(stored).map((v) => v.version)).toEqual([1, 2]);
    expect(() => appendVersion(stored, entry(4))).toThrow(RangeError);
    expect(() => appendVersion(null, entry(2))).toThrow(RangeError);
  });

  it('detects a version whose text was altered after publication', () => {
    const v = entry(1);
    expect(versionIsIntact('m1', v)).toBe(true);
    expect(versionIsIntact('m1', { ...v, text: 'Autre texte' })).toBe(false);
    expect(versionIsIntact('m2', v)).toBe(false);
  });
});
