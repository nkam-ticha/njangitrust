// The period a statement covers (spec 2.14): a month, a cycle or custom dates, resolved to UTC
// instants of Africa/Douala days by the rules package, with the words that name it in both languages.
import { formatDateShort, type Bilingual } from '@njangi/shared';
import type { StatementPeriodRequest } from '@njangi/shared/contracts/statements';
import { monthNames, statementTexts as t } from '@njangi/shared/i18n/server/statements';
import {
  daysPeriod,
  fromDoualaLocal,
  monthPeriod,
  toDoualaLocal,
  validatePeriod,
  type StatementPeriod,
} from '@njangi/rules';
import type { Db } from '../../lib/prisma';
import { bilingual } from '../../lib/texts';
import { statementError } from './statements.errors';

export interface ResolvedPeriod {
  period: StatementPeriod;
  /** "octobre 2026", "cycle 2", "du 1 oct. 2026 au 15 oct. 2026". */
  label: Bilingual;
}

interface Day {
  year: number;
  month: number;
  day: number;
}

/** A `YYYY-MM-DD` day that exists in the calendar, or a refusal (31 February is not rolled over). */
function parseDay(value: string): Day {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const back = toDoualaLocal(fromDoualaLocal({ year, month, day }));
  if (back.year !== year || back.month !== month || back.day !== day) {
    throw statementError('PERIOD_INVALID');
  }
  return { year, month, day };
}

export function monthLabel(year: number, month: number): Bilingual {
  return bilingual(t.monthPeriod, {
    month: { fr: monthNames.fr[month - 1]!, en: monthNames.en[month - 1]! },
    year,
  });
}

async function cyclePeriod(
  db: Db,
  groupId: string,
  number: number | undefined,
  now: Date,
): Promise<ResolvedPeriod> {
  const cycle = number
    ? await db.cycle.findUnique({ where: { groupId_number: { groupId, number } } })
    : await db.cycle.findFirst({
        where: { groupId, startedAt: { not: null } },
        orderBy: { number: 'desc' },
      });
  if (!cycle?.startedAt) throw statementError('CYCLE_NOT_FOUND');
  // A cycle still running is covered up to the end of today (Douala), so a statement asked twice the
  // same day has the same period.
  const { year, month, day } = toDoualaLocal(now);
  const today = { year, month, day };
  const end = cycle.closedAt?.toISOString() ?? daysPeriod(today, today).end;
  return {
    period: { start: cycle.startedAt.toISOString(), end },
    label: bilingual(t.cyclePeriod, { cycle: cycle.number }),
  };
}

/** Resolves the request, or throws a bilingual refusal (unknown cycle, bad dates, not started yet). */
export async function resolvePeriod(
  db: Db,
  groupId: string,
  request: StatementPeriodRequest,
  now: Date,
): Promise<ResolvedPeriod> {
  let resolved: ResolvedPeriod;
  if (request.kind === 'MONTH') {
    resolved = {
      period: monthPeriod(request.year, request.month),
      label: monthLabel(request.year, request.month),
    };
  } else if (request.kind === 'CYCLE') {
    resolved = await cyclePeriod(db, groupId, request.number, now);
  } else {
    const period = daysPeriod(parseDay(request.from), parseDay(request.to));
    const lastDay = new Date(Date.parse(period.end) - 1);
    resolved = {
      period,
      label: bilingual(t.customPeriod, {
        from: {
          fr: formatDateShort(period.start, 'fr', { withYear: true }),
          en: formatDateShort(period.start, 'en', { withYear: true }),
        },
        to: {
          fr: formatDateShort(lastDay, 'fr', { withYear: true }),
          en: formatDateShort(lastDay, 'en', { withYear: true }),
        },
      }),
    };
  }
  const refusal = validatePeriod(resolved.period);
  if (refusal) throw statementError(refusal);
  if (Date.parse(resolved.period.end) <= Date.parse(resolved.period.start)) {
    throw statementError('PERIOD_ENDS_BEFORE_START');
  }
  if (Date.parse(resolved.period.start) > now.getTime())
    throw statementError('PERIOD_IN_THE_FUTURE');
  return resolved;
}
