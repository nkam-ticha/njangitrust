import { meetingErrorTexts as t } from '@njangi/shared/i18n/server/meetings';
import { defineErrors } from '../../lib/errors';

export const meetingError = defineErrors({
  MEETING_NOT_FOUND: { status: 404, text: t.MEETING_NOT_FOUND },
  MEETING_IN_THE_PAST: { status: 400, text: t.MEETING_IN_THE_PAST },
  MEETING_TOO_FAR: { status: 400, text: t.MEETING_TOO_FAR },
  MEETING_NOT_SCHEDULED: { status: 409, text: t.MEETING_NOT_SCHEDULED },
  CHECK_IN_NOT_OPEN_YET: { status: 409, text: t.CHECK_IN_NOT_OPEN_YET },
  CHECK_IN_CLOSED: { status: 409, text: t.CHECK_IN_CLOSED },
  ALREADY_CHECKED_IN: { status: 409, text: t.ALREADY_CHECKED_IN },
  EXCUSE_TOO_LATE: { status: 409, text: t.EXCUSE_TOO_LATE },
  ALREADY_PRESENT: { status: 409, text: t.ALREADY_PRESENT },
  AGENDA_CLOSED: { status: 409, text: t.AGENDA_CLOSED },
  AGENDA_FULL: { status: 409, text: t.AGENDA_FULL },
  MARK_NOT_ALLOWED: { status: 409, text: t.MARK_NOT_ALLOWED },
  NOT_A_PARTICIPANT: { status: 400, text: t.NOT_A_PARTICIPANT },
  MEETING_NOT_STARTED: { status: 409, text: t.MEETING_NOT_STARTED },
  MEETING_NOT_CLOSED: { status: 409, text: t.MEETING_NOT_CLOSED },
  MEETING_ALREADY_CLOSED: { status: 409, text: t.MEETING_ALREADY_CLOSED },
  CORRECTION_REASON_REQUIRED: { status: 400, text: t.CORRECTION_REASON_REQUIRED },
  MINUTES_UNCHANGED: { status: 409, text: t.MINUTES_UNCHANGED },
  MINUTES_NOT_PUBLISHED: { status: 404, text: t.MINUTES_NOT_PUBLISHED },
});

export type MeetingErrorCode = Parameters<typeof meetingError>[0];
