// Meeting mappers (spec 2.11, R15): an allowlist of fields. The reason of an excuse leaves only
// for the admin and for the member who wrote it; no mapper takes a phone number.
import type { Bilingual } from '@njangi/shared';
import type {
  AgendaItemDto,
  AttendanceRowDto,
  AttendanceStatus,
  MeetingDto,
  MinutesVersionDto,
} from '@njangi/shared/contracts/meetings';
import { iso, isoOrNull } from './time';

export interface MeetingSource {
  id: string;
  groupId: string;
  scheduledAt: Date;
  place: string;
  status: MeetingDto['status'];
  checkIn: { opensAt: Date; closesAt: Date; open: boolean };
  agendaGeneratedAt: Date | null;
  autoItems: { key: string; text: Bilingual }[];
  memberItems: {
    id: string;
    text: string;
    author: { id: string; user: { name: string } } | null;
  }[];
  counts: { present: number; excused: number; absent: number | null };
  me: {
    status: AttendanceStatus;
    checkedInAt: Date | null;
    canCheckIn: boolean;
    canExcuse: boolean;
  };
  minutes: { version: number; publishedAt: Date | null };
}

export function toMeeting(m: MeetingSource): MeetingDto {
  const agenda: AgendaItemDto[] = [
    ...m.autoItems.map((i) => ({
      id: `auto:${i.key}`,
      source: 'AUTO' as const,
      text: i.text,
      author: null,
    })),
    ...m.memberItems.map((i) => ({
      id: i.id,
      source: 'MEMBER' as const,
      text: { fr: i.text, en: i.text },
      author: i.author ? { membershipId: i.author.id, name: i.author.user.name } : null,
    })),
  ];
  return {
    id: m.id,
    groupId: m.groupId,
    scheduledAt: iso(m.scheduledAt),
    place: m.place,
    status: m.status,
    checkIn: {
      opensAt: iso(m.checkIn.opensAt),
      closesAt: iso(m.checkIn.closesAt),
      open: m.checkIn.open,
    },
    agendaGeneratedAt: isoOrNull(m.agendaGeneratedAt),
    agenda,
    counts: { present: m.counts.present, excused: m.counts.excused, absent: m.counts.absent },
    me: {
      status: m.me.status,
      checkedInAt: isoOrNull(m.me.checkedInAt),
      canCheckIn: m.me.canCheckIn,
      canExcuse: m.me.canExcuse,
    },
    minutes: { version: m.minutes.version, publishedAt: isoOrNull(m.minutes.publishedAt) },
  };
}

export interface AttendanceSource {
  member: { id: string; user: { name: string } };
  status: AttendanceStatus;
  checkedInAt: Date | null;
  markedByAdmin: boolean;
  excuseReason: string | null;
}

/** `showReason`: the viewer is the admin or the member the row is about. */
export function toAttendanceRow(a: AttendanceSource, showReason: boolean): AttendanceRowDto {
  return {
    member: { membershipId: a.member.id, name: a.member.user.name },
    status: a.status,
    checkedInAt: isoOrNull(a.checkedInAt),
    markedByAdmin: a.markedByAdmin,
    excuseReason: showReason ? a.excuseReason : null,
  };
}

export interface MinutesVersionSource {
  version: number;
  text: string;
  correctionReason: string | null;
  publishedAt: string;
  publishedBy: { id: string; user: { name: string } };
  hash: string;
}

export function toMinutesVersion(v: MinutesVersionSource): MinutesVersionDto {
  return {
    version: v.version,
    text: v.text,
    correctionReason: v.correctionReason,
    publishedAt: v.publishedAt,
    publishedBy: { membershipId: v.publishedBy.id, name: v.publishedBy.user.name },
    hash: v.hash,
  };
}
