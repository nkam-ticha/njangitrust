import { formatXAF } from '@njangi/shared';
import { z } from 'zod';
import { ui } from '../../lib/texts';
import { defineActionHandler } from '../pending-actions';
import { openAdminLoanProposal } from '../proposals';
import { loanError } from './loans.errors';
import {
  applyLoanDecision,
  getLoanQuote,
  hasLoanDisbursementScheduler,
  scheduleApprovedLoanDisbursement,
  validateDecision,
} from './loans.service';

const requestArgs = z.strictObject({
  groupId: z.string().uuid(),
  amount: z.number().int().positive(),
  months: z.number().int().min(1).max(6),
});
const decisionArgs = z.strictObject({
  loanId: z.string().uuid(),
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().min(1).max(500),
});

export const requestLoanHandler = defineActionHandler({
  type: 'REQUEST_LOAN',
  level: 'L1',
  args: requestArgs,

  async prepare(ctx, args) {
    const quote = await getLoanQuote(
      ctx.userId,
      args.groupId,
      { amount: args.amount, months: args.months },
      ctx.now,
      ctx.db,
    );
    if (!quote.ok) {
      throw loanError('LOAN_UNAVAILABLE');
    }
    const member = await ctx.db.membership.findFirstOrThrow({
      where: { groupId: args.groupId, userId: ctx.userId },
      select: { role: true },
    });
    return {
      title: ui((c) => c.confirmation.actions.requestLoan.title),
      lines: [{ label: ui((c) => c.confirmation.lines.principal), amount: quote.principal }],
      total: quote.principal,
      notes: [
        ui((c) =>
          member.role === 'ADMIN'
            ? c.confirmation.notes.loanAdminVote
            : c.confirmation.notes.loanAdmin,
        ),
      ],
      confirmLabel: ui((c) => c.confirmation.actions.requestLoan.button, {
        amount: { fr: formatXAF(args.amount, 'fr'), en: formatXAF(args.amount, 'en') },
      }),
    };
  },

  async execute(ctx, args) {
    const quote = await getLoanQuote(
      ctx.userId,
      args.groupId,
      { amount: args.amount, months: args.months },
      ctx.now,
      ctx.db,
    );
    if (!quote.ok) throw loanError('LOAN_UNAVAILABLE');
    const membership = await ctx.db.membership.findFirstOrThrow({
      where: { groupId: args.groupId, userId: ctx.userId },
      select: { id: true, role: true },
    });
    const loan = await ctx.db.loan.create({
      data: {
        groupId: args.groupId,
        membershipId: membership.id,
        principal: quote.principal,
        months: quote.months,
        // LOA-02: interest and disbursement fee are fixed at approval, not request time.
        ratePermille: 0,
        interest: 0,
        feeEstimated: 0,
        totalDue: quote.principal,
        status: 'REQUESTED',
      },
    });
    if (membership.role === 'ADMIN') {
      await openAdminLoanProposal(
        ctx.db,
        {
          adminUserId: ctx.userId,
          groupId: args.groupId,
          loanId: loan.id,
          membershipId: membership.id,
          amount: loan.principal,
          months: loan.months,
        },
        ctx.effects,
      );
    }
    return {
      outcome: 'done',
      resultRef: loan.id,
      summary: ui((c) => c.confirmation.actions.requestLoan.done),
    };
  },
});

export const decideLoanHandler = defineActionHandler({
  type: 'DECIDE_LOAN',
  level: 'L1',
  args: decisionArgs,

  async prepare(ctx, args) {
    if (args.decision === 'approve' && !hasLoanDisbursementScheduler())
      throw loanError('LOAN_UNAVAILABLE');
    const decision = await validateDecision(ctx.db, {
      ...args,
      userId: ctx.userId,
      now: ctx.now,
    });
    const loan = decision.loan;
    const title =
      args.decision === 'approve'
        ? ui((c) => c.confirmation.actions.approveLoan.title)
        : ui((c) => c.confirmation.actions.rejectLoan.title);
    return {
      title,
      lines: [
        { label: ui((c) => c.confirmation.lines.principal), amount: loan.principal },
        ...(decision.quote
          ? [
              {
                label: ui((c) => c.confirmation.lines.interest, {
                  percent: decision.quote.ratePermille / 10,
                  months: loan.months,
                }),
                amount: decision.quote.interest,
              },
              { label: ui((c) => c.confirmation.lines.totalDue), amount: decision.quote.totalDue },
            ]
          : []),
      ],
      total: args.decision === 'approve' ? decision.quote!.totalDue : null,
      notes: [{ fr: args.reason, en: args.reason }],
      confirmLabel:
        args.decision === 'approve'
          ? ui((c) => c.confirmation.actions.approveLoan.button, {
              amount: { fr: formatXAF(loan.principal, 'fr'), en: formatXAF(loan.principal, 'en') },
            })
          : ui((c) => c.confirmation.actions.rejectLoan.button),
    };
  },

  async execute(ctx, args) {
    const decision = await validateDecision(ctx.db, {
      ...args,
      userId: ctx.userId,
      now: ctx.now,
    });
    const decided = await applyLoanDecision(
      ctx.db,
      decision.loan.id,
      args.decision,
      args.reason,
      ctx.now,
      decision.quote ?? undefined,
    );
    if (args.decision === 'approve')
      ctx.afterCommit(() => scheduleApprovedLoanDisbursement(decided.id));
    return {
      outcome: 'done',
      resultRef: decided.id,
      summary: ui((c) =>
        args.decision === 'approve'
          ? c.confirmation.actions.approveLoan.done
          : c.confirmation.actions.rejectLoan.done,
      ),
    };
  },
});
