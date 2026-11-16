// What a meeting allows, and when (spec R15), as small pure functions that return the code of the
// refusal or null. The service and the PendingAction handlers both call them, so a card is refused
// for the same reason the action would fail. Time is always an argument; the checks use the rules
// package for the windows (R15.3).
import {
  addCalendarMonths,
  addHours,
  canSendExcuse,
  checkInWindow,
  isCheckInOpen,
} from '@njangi/rules';
import type { MeetingErrorCode } from './meetings.errors';

type Status = 'SCHEDULED' | 'HELD' | 'CANCELLED';

/** R15.2: the agenda is generated this many hours before the start. */
export const AGENDA_LEAD_HOURS = 24;
/** R15.4: the minutes cover what happened from the start until this many hours later. */
export const MINUTES_WINDOW_HOURS = 6;
/** Members may add at most this many items to one agenda. */
export const MAX_MEMBER_ITEMS = 30;
/** A meeting is scheduled at most this many months ahead. */
export const MAX_MONTHS_AHEAD = 12;

export const agendaDueAt = (scheduledAt: Date): Date => addHours(scheduledAt, -AGENDA_LEAD_HOURS);

export function scheduleRefusal(scheduledAt: Date, now: Date): MeetingErrorCode | null {
  if (scheduledAt.getTime() <= now.getTime()) return 'MEETING_IN_THE_PAST';
  if (scheduledAt.getTime() > addCalendarMonths(now, MAX_MONTHS_AHEAD).getTime())
    return 'MEETING_TOO_FAR';
  return null;
}

const notOpen = (status: Status): MeetingErrorCode | null =>
  status === 'SCHEDULED' ? null : 'MEETING_NOT_SCHEDULED';

/** R15.3: check-in from 1 h before to 2 h after the start. */
export function checkInRefusal(input: {
  status: Status;
  scheduledAt: Date;
  now: Date;
  alreadyPresent: boolean;
}): MeetingErrorCode | null {
  const closed = notOpen(input.status);
  if (closed) return closed;
  if (input.alreadyPresent) return 'ALREADY_CHECKED_IN';
  if (isCheckInOpen(input.scheduledAt, input.now)) return null;
  return input.now.getTime() < checkInWindow(input.scheduledAt).opensAt.getTime()
    ? 'CHECK_IN_NOT_OPEN_YET'
    : 'CHECK_IN_CLOSED';
}

/** R15.3, R6.3: an excuse counts only when sent before the start. */
export function excuseRefusal(input: {
  status: Status;
  scheduledAt: Date;
  now: Date;
  alreadyPresent: boolean;
}): MeetingErrorCode | null {
  const closed = notOpen(input.status);
  if (closed) return closed;
  if (input.alreadyPresent) return 'ALREADY_PRESENT';
  return canSendExcuse(input.scheduledAt, input.now) ? null : 'EXCUSE_TOO_LATE';
}

/** R15.2: members add items until the meeting starts. */
export function agendaItemRefusal(input: {
  status: Status;
  scheduledAt: Date;
  now: Date;
  memberItems: number;
}): MeetingErrorCode | null {
  const closed = notOpen(input.status);
  if (closed) return closed;
  if (input.now.getTime() >= input.scheduledAt.getTime()) return 'AGENDA_CLOSED';
  return input.memberItems >= MAX_MEMBER_ITEMS ? 'AGENDA_FULL' : null;
}

/** R15.3: the admin marks attendance from the moment check-in opens until the meeting is closed. */
export function markRefusal(input: {
  status: Status;
  scheduledAt: Date;
  now: Date;
}): MeetingErrorCode | null {
  const closed = notOpen(input.status);
  if (closed) return closed;
  return input.now.getTime() < checkInWindow(input.scheduledAt).opensAt.getTime()
    ? 'MARK_NOT_ALLOWED'
    : null;
}

/** R6.3: the meeting closes after it has started; closing twice is refused. */
export function closeRefusal(input: {
  status: Status;
  scheduledAt: Date;
  now: Date;
}): MeetingErrorCode | null {
  if (input.status === 'HELD') return 'MEETING_ALREADY_CLOSED';
  const closed = notOpen(input.status);
  if (closed) return closed;
  return input.now.getTime() < input.scheduledAt.getTime() ? 'MEETING_NOT_STARTED' : null;
}

/** R15.4: a draft needs a meeting that has started (and was not cancelled). */
export function draftRefusal(input: {
  status: Status;
  scheduledAt: Date;
  now: Date;
}): MeetingErrorCode | null {
  if (input.status === 'CANCELLED') return 'MEETING_NOT_SCHEDULED';
  return input.now.getTime() < input.scheduledAt.getTime() ? 'MEETING_NOT_STARTED' : null;
}

/** R15.4: publish once; then only corrections, each with a reason and a different text. */
export function publishRefusal(input: {
  status: Status;
  latestText: string | null;
  text: string;
  reason: string | null;
}): MeetingErrorCode | null {
  if (input.status !== 'HELD') return 'MEETING_NOT_CLOSED';
  if (input.latestText === null) return null;
  if (!input.reason) return 'CORRECTION_REASON_REQUIRED';
  return input.latestText === input.text ? 'MINUTES_UNCHANGED' : null;
}
