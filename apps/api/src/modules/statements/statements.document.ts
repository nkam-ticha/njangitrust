// What a statement prints (spec 2.14), as plain text rows in the member's language. Every amount and
// total comes from the rules package's `StatementData` and is formatted with `formatXAF`; nothing is
// added up here. The PDF (statements.pdf.ts) only draws this.
import { formatClock, formatDateShort, formatXAF, interpolate, type Lang } from '@njangi/shared';
import { statementPdfLabels, type StatementPdfLabels } from '@njangi/shared/i18n/server/statements';
import { STATEMENT_CATEGORIES, type StatementData, type StatementLine } from '@njangi/rules';

export interface DocumentRow {
  date: string;
  text: string;
  amount: string;
  /** A second, smaller line: fees already deducted from a payout, the interest of a loan. */
  note: string | null;
}

export interface DocumentSection {
  title: string;
  rows: DocumentRow[];
  /** Shown instead of rows when the section is empty. */
  none: string | null;
  total: string;
}

export interface StatementDocument {
  lang: Lang;
  title: string;
  header: { label: string; value: string }[];
  amountLabel: string;
  totalLabel: string;
  sections: DocumentSection[];
  reliability: { title: string; line: string; formula: string };
  footer: { code: string; address: string; note: string };
}

export interface StatementNames {
  groupName: string;
  memberName: string;
  /** The period in words, in the statement's language ("octobre 2026"). */
  periodLabel: string;
  verificationCode: string;
  /** Host and path without the scheme: `app.example.com/verify/0123456789ab`. */
  verifyAddress: string;
}

const day = (at: string | Date, lang: Lang) => formatDateShort(at, lang, { withYear: true });

function rowText(line: StatementLine, t: StatementPdfLabels): string {
  const parts: string[] = [];
  const kind = t.kinds[line.kind as keyof StatementPdfLabels['kinds']];
  if (kind) parts.push(kind);
  if (line.roundNumber !== null) parts.push(`${t.round} ${line.roundNumber}`);
  if (line.onTime !== null) parts.push(line.onTime ? t.onTime : t.late);
  if (line.reversal) parts.push(`(${t.reversal})`);
  return parts.join(' · ');
}

function rowNote(line: StatementLine, t: StatementPdfLabels, lang: Lang): string | null {
  if (line.feeShare !== 0) {
    return interpolate(t.feeShareNote, { amount: formatXAF(line.feeShare, lang) });
  }
  if (line.interest !== 0) {
    return interpolate(t.interestNote, { amount: formatXAF(line.interest, lang) });
  }
  return null;
}

/** The statement as rows of text, section by section in the order of spec 2.14. */
export function statementDocument(data: StatementData, names: StatementNames): StatementDocument {
  const lang = data.language;
  const t = statementPdfLabels[lang];
  const lastDay = new Date(Date.parse(data.period.end) - 1);
  const sections = STATEMENT_CATEGORIES.map((category): DocumentSection => {
    const lines = data.lines.filter((l) => l.category === category);
    return {
      title: t.sections[category],
      rows: lines.map((l) => ({
        date: day(l.at, lang),
        text: rowText(l, t),
        amount: formatXAF(l.amount, lang),
        note: rowNote(l, t, lang),
      })),
      none: lines.length === 0 ? t.none : null,
      total: formatXAF(data.totals[category], lang),
    };
  });
  const r = data.reliability;
  return {
    lang,
    title: t.title,
    header: [
      { label: t.group, value: names.groupName },
      { label: t.member, value: names.memberName },
      {
        label: t.period,
        value: `${names.periodLabel} (${day(data.period.start, lang)} – ${day(lastDay, lang)})`,
      },
      {
        label: t.issued,
        value: `${day(data.issuedAt, lang)}, ${formatClock(data.issuedAt, lang)}`,
      },
    ],
    amountLabel: t.amount,
    totalLabel: t.total,
    sections,
    reliability: {
      title: t.reliability,
      line:
        r.newMember || r.score === null
          ? t.reliabilityNew
          : interpolate(t.reliabilityScore, { score: r.score, onTime: r.onTime, due: r.due }),
      formula: interpolate(t.reliabilityFormula, { window: r.window }),
    },
    footer: {
      code: `${t.verification}${lang === 'fr' ? ' :' : ':'} ${names.verificationCode}`,
      address: `${t.verifyAt} ${names.verifyAddress}`,
      note: t.footerNote,
    },
  };
}
