// The agent's statements port (agent/ports.ts) on the statements module. The statement is created
// if needed and shown by the app as a card: no amount of it passes through the model (spec 4.5).
import { toDouala } from '@njangi/shared';
import type { CreateStatementRequest } from '@njangi/shared/contracts/statements';
import { statementCard } from '../../modules/statements';
import type { AgentStatementsPort } from '../ports';
import type { AgentCtx } from '../types';

/** "YYYY-MM", "cycle", or nothing: the month before `ctx.now` in Douala. */
export function periodOf(
  ctx: Pick<AgentCtx, 'now'>,
  period: string | undefined,
): { request: CreateStatementRequest['period']; label: string } {
  if (period === 'cycle') return { request: { kind: 'CYCLE' }, label: 'cycle' };
  if (period) {
    const [year, month] = period.split('-').map(Number) as [number, number];
    return { request: { kind: 'MONTH', year, month }, label: period };
  }
  const today = toDouala(ctx.now);
  const year = today.month === 1 ? today.year - 1 : today.year;
  const month = today.month === 1 ? 12 : today.month - 1;
  return {
    request: { kind: 'MONTH', year, month },
    label: `${year}-${String(month).padStart(2, '0')}`,
  };
}

export const statementsAdapter: AgentStatementsPort = {
  async statement(ctx, input) {
    // Tools check the active group before calling the port (needGroup).
    if (!ctx.groupId) throw new Error('statements port called without an active group');
    const { request, label } = periodOf(ctx, input.period);
    const card = await statementCard(ctx.userId, {
      groupId: ctx.groupId,
      period: request,
      language: ctx.lang,
    });
    return { statementId: card.statementId, period: label };
  },
};
