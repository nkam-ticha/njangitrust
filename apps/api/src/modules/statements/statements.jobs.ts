// Statement jobs (spec 2.9 `statements.monthly`): on the 1st of each month at 07:00 (Douala) last
// month's statement is made for every member and they are told. The monthly job only plans one small
// job per member (ids only), so each run stays short and a retry never makes a second statement.
import { monthPeriod, previousMonthPeriod, toDoualaLocal } from '@njangi/rules';
import { statementTexts as t } from '@njangi/shared/i18n/server/statements';
import type { Job } from 'bullmq';
import { dispatchJob } from '../../jobs/dispatch';
import { registerJob, registerRepeatable } from '../../jobs/registry';
import { clock } from '../../lib/clock';
import { getPrisma } from '../../lib/prisma';
import { bilingual } from '../../lib/texts';
import { notify } from '../notifications';
import { issueStatement } from './statements.service';
import { monthLabel } from './statements.period';

export const statementsLink = (groupId: string) => `/groups/${groupId}/statements`;

interface MonthlyPayload {
  membershipId: string;
  year: number;
  month: number;
}

/** Plans last month's statement for every current member of an active group. Returns how many. */
export async function planMonthlyStatements(now: Date = clock.now()): Promise<number> {
  const { year, month } = toDoualaLocal(new Date(previousMonthPeriod(now).start));
  const members = await getPrisma().membership.findMany({
    where: {
      status: { in: ['ACTIVE', 'LEAVING'] },
      group: { status: 'ACTIVE' },
      user: { deletedAt: null },
    },
    select: { id: true },
  });
  for (const { id } of members) {
    await dispatchJob(
      'statements.generate',
      { membershipId: id, year, month },
      { jobId: `statement-${id}-${year}-${month}` },
    );
  }
  return members.length;
}

/** Makes one member's statement of a month and tells them, once. Returns whether it was created. */
export async function generateMonthlyStatement(
  payload: MonthlyPayload,
  now: Date = clock.now(),
): Promise<boolean> {
  const membership = await getPrisma().membership.findUnique({
    where: { id: payload.membershipId },
    select: {
      id: true,
      groupId: true,
      group: { select: { name: true, hiddenByDeveloperAt: true } },
      user: { select: { id: true, name: true, language: true, deletedAt: true } },
    },
  });
  if (!membership || membership.user.deletedAt) return false;
  // D28: a job queued before a developer closed and hid the group writes and sends nothing.
  if (membership.group.hiddenByDeveloperAt) return false;
  const label = monthLabel(payload.year, payload.month);
  const { created } = await issueStatement({
    membershipId: membership.id,
    groupId: membership.groupId,
    groupName: membership.group.name,
    memberName: membership.user.name,
    language: membership.user.language,
    resolved: { period: monthPeriod(payload.year, payload.month), label },
    now,
  });
  if (!created) return false;
  await notify([
    {
      userId: membership.user.id,
      groupId: membership.groupId,
      category: 'MONEY',
      title: bilingual(t.readyTitle),
      body: bilingual(t.readyBody, { group: membership.group.name, period: label }),
      deepLink: statementsLink(membership.groupId),
    },
  ]);
  return true;
}

let registered = false;

export function registerStatementJobs(): void {
  if (registered) return;
  registered = true;
  registerJob({
    name: 'statements.monthly',
    process: async () => {
      await planMonthlyStatements();
    },
  });
  registerJob({
    name: 'statements.generate',
    process: async (job: Job<MonthlyPayload>) => {
      await generateMonthlyStatement(job.data);
    },
  });
  // Spec 2.9: the 1st at 07:00. The cron function matches the exact minute, so three later runs
  // catch a missed one; planning again is harmless (one job and one statement per member and month).
  registerRepeatable({
    id: 'statements.monthly.1st',
    name: 'statements.monthly',
    pattern: '0 7,13 1,2 * *',
  });
}
