// Meetings (spec 2.7 Meetings, R15, FSD MTG-01): the admin schedules, the agenda is generated 24 hours
// before, members check in (or the admin marks them) or send an excuse, and the admin publishes the
// minutes. Published minutes never change: a correction is a new version with a reason.
import { z } from 'zod';
import { bilingualSchema, instantSchema, textSchema, uuidSchema } from './common';

export const meetingStatusSchema = z.enum(['SCHEDULED', 'HELD', 'CANCELLED']);
export type MeetingStatus = z.infer<typeof meetingStatusSchema>;

export const PLACE_MAX_CHARS = 200;
export const AGENDA_ITEM_MAX_CHARS = 300;
export const EXCUSE_MAX_CHARS = 300;
export const NOTES_MAX_CHARS = 4000;
export const MINUTES_MAX_CHARS = 20_000;

const memberRefSchema = z.strictObject({ membershipId: uuidSchema, name: z.string() });

/** R15.2: `AUTO` items are generated, `MEMBER` items are added by a member. */
export const agendaItemSchema = z.strictObject({
  /** A member item's id, or `auto:<key>` for a generated one. */
  id: z.string(),
  source: z.enum(['AUTO', 'MEMBER']),
  text: bilingualSchema,
  author: memberRefSchema.nullable(),
});
export type AgendaItemDto = z.infer<typeof agendaItemSchema>;

export const attendanceStatusSchema = z.enum(['PRESENT', 'EXCUSED', 'ABSENT', 'UNMARKED']);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

export const attendanceRowSchema = z.strictObject({
  member: memberRefSchema,
  status: attendanceStatusSchema,
  checkedInAt: instantSchema.nullable(),
  /** The admin marked this presence (it was not a self check-in). */
  markedByAdmin: z.boolean(),
  /** The reason of an excuse: the admin and the member themself see it, nobody else. */
  excuseReason: z.string().nullable(),
});
export type AttendanceRowDto = z.infer<typeof attendanceRowSchema>;

export const meetingSchema = z.strictObject({
  id: uuidSchema,
  groupId: uuidSchema,
  scheduledAt: instantSchema,
  place: z.string(),
  status: meetingStatusSchema,
  /** R15.3: check-in opens 1 h before the start and closes 2 h after. */
  checkIn: z.strictObject({ opensAt: instantSchema, closesAt: instantSchema, open: z.boolean() }),
  /** Generated 24 h before the start; null until then. */
  agendaGeneratedAt: instantSchema.nullable(),
  agenda: z.array(agendaItemSchema),
  counts: z.strictObject({
    present: z.number().int().nonnegative(),
    excused: z.number().int().nonnegative(),
    /** Only after the meeting is closed; before that nobody is "absent" yet. */
    absent: z.number().int().nonnegative().nullable(),
  }),
  /** The viewer's own attendance. */
  me: z.strictObject({
    status: attendanceStatusSchema,
    checkedInAt: instantSchema.nullable(),
    canCheckIn: z.boolean(),
    canExcuse: z.boolean(),
  }),
  minutes: z.strictObject({
    /** Latest published version, 0 when none. */
    version: z.number().int().nonnegative(),
    publishedAt: instantSchema.nullable(),
  }),
});
export type MeetingDto = z.infer<typeof meetingSchema>;

export const meetingListSchema = z.strictObject({ meetings: z.array(meetingSchema) });

export const meetingResponseSchema = z.strictObject({ meeting: meetingSchema });

/** GET /meetings/:id/attendance. */
export const attendanceListSchema = z.strictObject({ attendance: z.array(attendanceRowSchema) });

export const meetingListQuerySchema = z.strictObject({
  /** `upcoming` (default): not yet held, soonest first. `past`: newest first. */
  when: z.enum(['upcoming', 'past']).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/** R15.1: the admin schedules a meeting: a date and time, and a place or a link. */
export const scheduleMeetingRequestSchema = z.strictObject({
  scheduledAt: instantSchema,
  place: textSchema(PLACE_MAX_CHARS),
});
export type ScheduleMeetingRequest = z.infer<typeof scheduleMeetingRequestSchema>;

export const addAgendaItemRequestSchema = z.strictObject({
  text: textSchema(AGENDA_ITEM_MAX_CHARS),
});
export type AddAgendaItemRequest = z.infer<typeof addAgendaItemRequestSchema>;

/** R15.3: an excuse counts only when sent before the start. */
export const excuseRequestSchema = z.strictObject({ reason: textSchema(EXCUSE_MAX_CHARS) });
export type ExcuseRequest = z.infer<typeof excuseRequestSchema>;

/** R15.3: the admin marks several members at once. */
export const markAttendanceRequestSchema = z.strictObject({
  marks: z
    .array(z.strictObject({ membershipId: uuidSchema, present: z.boolean() }))
    .min(1)
    .max(60),
});
export type MarkAttendanceRequest = z.infer<typeof markAttendanceRequestSchema>;

/** R15.4: the admin's typed notes go into the draft. */
export const draftMinutesRequestSchema = z.strictObject({
  notes: textSchema(NOTES_MAX_CHARS).optional(),
});
export type DraftMinutesRequest = z.infer<typeof draftMinutesRequestSchema>;

export const minutesDraftSchema = z.strictObject({
  meetingId: uuidSchema,
  /** The language the draft is written in (the admin's). */
  language: z.enum(['fr', 'en']),
  text: z.string(),
  generatedAt: instantSchema,
});
export const minutesDraftResponseSchema = z.strictObject({ draft: minutesDraftSchema });

/** R15.4: publish the final text; from the second publication on a reason is required. */
export const publishMinutesRequestSchema = z.strictObject({
  text: textSchema(MINUTES_MAX_CHARS),
  reason: textSchema(EXCUSE_MAX_CHARS).optional(),
});
export type PublishMinutesRequest = z.infer<typeof publishMinutesRequestSchema>;

export const minutesVersionSchema = z.strictObject({
  version: z.number().int().positive(),
  text: z.string(),
  /** Null for the first publication. */
  correctionReason: z.string().nullable(),
  publishedAt: instantSchema,
  publishedBy: memberRefSchema,
  /** SHA-256 recorded in the ledger EVENT of this publication (R15.4). */
  hash: z.string(),
});
export type MinutesVersionDto = z.infer<typeof minutesVersionSchema>;

export const minutesListSchema = z.strictObject({
  meetingId: uuidSchema,
  /** Newest first. */
  versions: z.array(minutesVersionSchema),
});
