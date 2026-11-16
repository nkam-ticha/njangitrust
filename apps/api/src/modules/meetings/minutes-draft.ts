// The minutes draft (R15.4), built deterministically from the agenda, the attendance, the votes, the
// payments and the events of the meeting, plus the admin's typed notes. The agent will polish it
// later; the admin edits and publishes it. Section titles are the designer's copy. The draft is
// written in one language (the admin's) and never lists who voted what: a vote shows its result only.
import { formatDateTime, formatXAF, type Bilingual, type Lang } from '@njangi/shared';
import { meetingTexts as t } from '@njangi/shared/i18n/server/meetings';
import { bilingual, ui } from '../../lib/texts';

export interface MinutesDraftInput {
  lang: Lang;
  scheduledAt: Date;
  place: string;
  present: readonly string[];
  excused: readonly string[];
  absent: readonly string[];
  /** The generated agenda lines. */
  agendaLines: readonly Bilingual[];
  /** Items members added to the agenda. */
  memberItems: readonly { text: string; author: string }[];
  /** Payments received during the meeting: how many and the whole francs received in total. */
  payments: { count: number; totalFcfa: number };
  votes: readonly {
    title: Bilingual;
    status: 'PASSED' | 'REJECTED' | 'EXPIRED';
    yes: number;
    no: number;
  }[];
  /** Ledger events of the meeting (rule applied, member joined, ...), already bilingual. */
  events: readonly Bilingual[];
  nextMeeting: { scheduledAt: Date; place: string } | null;
  notes: string | null;
}

const STATUS = {
  PASSED: t.minutesVotePassed,
  REJECTED: t.minutesVoteRejected,
  EXPIRED: t.minutesVoteExpired,
} as const;

/** A list as lines "- name", or the word "None" when it is empty. */
function list(lines: readonly string[], none: string): string[] {
  return lines.length === 0 ? [none] : lines.map((l) => `- ${l}`);
}

export function buildMinutesDraft(input: MinutesDraftInput): string {
  const { lang } = input;
  const say = (text: Bilingual, params: Record<string, string | number> = {}) =>
    bilingual(text, params)[lang];
  const section = (title: Bilingual): string => `## ${title[lang]}`;
  const dateAndPlace = ui((c) => c.meetings.minutes.sections.dateAndPlace);
  const none = say(t.minutesNone);
  const when = formatDateTime(input.scheduledAt, lang);
  const copy = (select: Parameters<typeof ui>[0]) => ui(select);

  const money =
    input.payments.count === 0
      ? [say(t.minutesNoMoney)]
      : [
          say(t.minutesMoneyLine, {
            count: input.payments.count,
            amount: formatXAF(input.payments.totalFcfa, lang),
          }),
        ];
  const next = input.nextMeeting
    ? say(t.minutesNextMeeting, {
        date: formatDateTime(input.nextMeeting.scheduledAt, lang),
        place: input.nextMeeting.place,
      })
    : say(t.minutesNoNextMeeting);
  const items = [
    ...input.agendaLines.map((l) => l[lang]),
    ...input.memberItems.map((i) => `${i.text} (${i.author})`),
  ];

  const out: string[] = [
    say(t.minutesTitle, { date: when }),
    '',
    section(dateAndPlace),
    say(t.dateLine, { date: when }),
    say(t.placeLine, { place: input.place }),
    '',
    section(copy((c) => c.meetings.minutes.sections.present)),
    ...list(input.present, none),
    '',
    section(copy((c) => c.meetings.minutes.sections.excused)),
    ...list(input.excused, none),
    '',
    section(copy((c) => c.meetings.minutes.sections.absent)),
    ...list(input.absent, none),
    '',
    section(copy((c) => c.meetings.minutes.sections.items)),
    ...list(items, none),
    '',
    section(copy((c) => c.meetings.minutes.sections.money)),
    ...money,
    '',
    section(copy((c) => c.meetings.minutes.sections.votes)),
    ...list(
      input.votes.map((v) =>
        say(t.minutesVoteLine, {
          title: v.title[lang],
          status: say(STATUS[v.status]),
          yes: v.yes,
          no: v.no,
        }),
      ),
      none,
    ),
  ];
  if (input.events.length > 0) {
    out.push(
      '',
      section(t.minutesEventsTitle),
      ...list(
        input.events.map((e) => e[lang]),
        none,
      ),
    );
  }
  out.push('', section(copy((c) => c.meetings.minutes.sections.nextMeeting)), next);
  if (input.notes) out.push('', section(t.minutesNotes), input.notes);
  return out.join('\n');
}
