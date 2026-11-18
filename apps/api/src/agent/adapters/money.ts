// The agent's money port (agent/ports.ts) on the money modules' services. Every call acts as the
// member in `ctx`; the services check the permissions. What goes back to the model is minimal and
// already worded: amounts through formatXAF, dates in Douala time, names but never numbers. Every
// action is a PendingAction the member confirms in the app (origin AGENT).
import type { TransactionType } from '@njangi/rules';
import { formatDateTime, formatXAF, type Lang } from '@njangi/shared';
import { readBids, placeBid } from '../../modules/bids';
import { getPrisma } from '../../lib/prisma';
import { readFunds, readLedger } from '../../modules/ledger';
import {
  getLoanQuote,
  listLoans,
  requestLoan,
  requestLoanDecision,
  requestLoanRepayment,
} from '../../modules/loans';
import { listMyGroups } from '../../modules/me';
import { listMembers } from '../../modules/members';
import { listMyDues, requestPayment } from '../../modules/payments';
import { readMyMoney, requestWithdrawal } from '../../modules/payouts';
import {
  currentRound,
  myTurn,
  readPayoutBreakdown,
  readRound,
} from '../../modules/rounds/rounds.service';
import { isAppError } from '../../lib/errors';
import { agentError } from '../errors';
import type { AgentData, AgentMoneyPort, SessionMoneyLines } from '../ports';
import { resolveMember } from '../tools/resolve-member';
import type { AgentCtx } from '../types';

function groupOf(ctx: AgentCtx): string {
  // Tools check the active group before calling the port (needGroup).
  if (!ctx.groupId) throw new Error('money port called without an active group');
  return ctx.groupId;
}

const money = (amount: number, lang: Lang) => formatXAF(amount, lang);

const KIND: Record<string, { fr: string; en: string }> = {
  CONTRIBUTION: { fr: 'cotisation', en: 'contribution' },
  SOLIDARITY: { fr: 'caisse de secours', en: 'solidarity fund' },
  FINE: { fr: 'amende', en: 'fine' },
  LOAN_INSTALLMENT: { fr: 'échéance de prêt', en: 'loan installment' },
  BID: { fr: 'enchère', en: 'bid' },
  SHORTFALL_SHARE: { fr: 'part de manque', en: 'shortfall share' },
  CORRECTION: { fr: 'correction', en: 'correction' },
};
const kindLabel = (kind: string, lang: Lang) => KIND[kind]?.[lang] ?? kind.toLowerCase();

/** A service refusal the member simply has nothing for (no cycle yet, no round) reads as null. */
async function orNull<T>(read: () => Promise<T>, codes: string[]): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (isAppError(error) && codes.includes(error.code)) return null;
    throw error;
  }
}

const NO_ROUND = ['ROUND_NOT_FOUND', 'PAYOUT_NOT_ASSIGNED'];

async function roundOf(ctx: AgentCtx, number: number | undefined) {
  const groupId = groupOf(ctx);
  const found = await orNull(
    () => (number ? readRound(ctx.userId, groupId, number) : currentRound(ctx.userId, groupId)),
    NO_ROUND,
  );
  if (!found) throw agentError('ROUND_NOT_FOUND');
  return found.round;
}

async function namesOf(ctx: AgentCtx): Promise<Map<string, string>> {
  const { members } = await listMembers(ctx.userId, groupOf(ctx));
  return new Map(members.map((m) => [m.id, m.user.name]));
}

function myMoneyLine(
  ctx: AgentCtx,
  mine: Awaited<ReturnType<typeof readMyMoney>>,
): { text: string; hold: string | null } {
  const fr = ctx.lang === 'fr';
  const hold = mine.hold
    ? fr
      ? `retraits suspendus jusqu’au ${formatDateTime(mine.hold.until, 'fr')}`
      : `withdrawals on hold until ${formatDateTime(mine.hold.until, 'en')}`
    : mine.withdrawalsPaused
      ? fr
        ? 'retraits suspendus pendant la vérification de la caisse'
        : 'withdrawals paused during the caisse check'
      : null;
  const parts = fr
    ? [
        `disponible ${money(mine.available, 'fr')}`,
        `bloqué ${money(mine.locked, 'fr')}`,
        `dettes ${money(mine.debtsDue, 'fr')}`,
        `retenue: ${hold ?? 'aucune'}`,
      ]
    : [
        `available ${money(mine.available, 'en')}`,
        `locked ${money(mine.locked, 'en')}`,
        `debts ${money(mine.debtsDue, 'en')}`,
        `hold: ${hold ?? 'none'}`,
      ];
  return { text: parts.join(', '), hold };
}

async function duesOf(ctx: AgentCtx, groupId: string) {
  const dues = await listMyDues(ctx.userId, groupId);
  return {
    dues,
    total: dues.reduce((sum, d) => sum + d.amount, 0),
    lines: dues.map((d) => ({
      what: kindLabel(d.kind, ctx.lang),
      ...(d.roundNumber ? { round: d.roundNumber } : {}),
      amount: money(d.amount, ctx.lang),
      dueAt: formatDateTime(d.dueAt, ctx.lang),
      late: d.dueAt.getTime() <= ctx.now.getTime(),
    })),
  };
}

async function groupOverview(ctx: AgentCtx, groupId: string): Promise<AgentData> {
  const [owed, mine, turn] = await Promise.all([
    duesOf(ctx, groupId),
    orNull(() => readMyMoney(ctx.userId, groupId), ['NO_ACTIVE_CYCLE']),
    myTurn(ctx.userId, groupId),
  ]);
  const first = owed.dues[0];
  return {
    toPay: owed.lines,
    due: money(owed.total, ctx.lang),
    dueTotal: owed.total,
    ...(first ? { deadline: formatDateTime(first.dueAt, ctx.lang) } : {}),
    ...(turn ? { myTurn: formatDateTime(turn.payoutAt, ctx.lang), myTurnRound: turn.round } : {}),
    ...(mine
      ? {
          available: money(mine.available, ctx.lang),
          locked: money(mine.locked, ctx.lang),
          ...(mine.unlocksAt ? { unlocksAt: formatDateTime(mine.unlocksAt, ctx.lang) } : {}),
          debts: money(mine.debtsDue, ctx.lang),
          hold: myMoneyLine(ctx, mine).hold,
          withdrawalInProgress: mine.withdrawalInProgress,
        }
      : {}),
  };
}

const LEDGER_TYPES = new Set<string>([
  'PAYMENT_RECEIVED',
  'POT_ASSIGNED',
  'DISBURSEMENT_SENT',
  'WITHDRAWAL_COMPLETED',
  'DISBURSEMENT_RETURNED',
  'LOAN_DISBURSED',
  'FINE_ASSESSED',
  'BID_ASSESSED',
  'AUTO_SETTLEMENT',
  'REVERSAL',
  'EVENT',
]);

function day(value: string | undefined, endOfDay: boolean): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  // Douala is UTC+1 all year.
  const at = new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}+01:00`);
  return Number.isNaN(at.getTime()) ? undefined : at;
}

export const moneyAdapter: AgentMoneyPort = {
  async sessionLines(ctx): Promise<SessionMoneyLines> {
    if (!ctx.groupId) return {};
    const groupId = ctx.groupId;
    const found = await orNull(() => currentRound(ctx.userId, groupId), NO_ROUND);
    if (!found) return {};
    const round = found.round;
    const fr = ctx.lang === 'fr';
    const [owed, mine] = await Promise.all([
      duesOf(ctx, groupId),
      orNull(() => readMyMoney(ctx.userId, groupId), ['NO_ACTIVE_CYCLE']),
    ]);
    const forRound = owed.dues.filter((d) => d.roundNumber === round.number);
    const roundTotal = forRound.reduce((sum, d) => sum + d.amount, 0);
    const deadline = formatDateTime(round.dueAt, ctx.lang);
    const payout = formatDateTime(round.payoutAt, ctx.lang);
    return {
      cycle: fr
        ? `cycle ${round.cycle}, tour ${round.number}`
        : `cycle ${round.cycle}, round ${round.number}`,
      ...(round.beneficiaryName
        ? {
            beneficiary: fr
              ? `${round.beneficiaryName}; échéance: ${deadline}; versement: ${payout}`
              : `${round.beneficiaryName}; deadline: ${deadline}; payout: ${payout}`,
          }
        : {}),
      myRound: [
        `myRound${round.number}`,
        roundTotal > 0
          ? fr
            ? `à payer, ${money(roundTotal, 'fr')}`
            : `to pay, ${money(roundTotal, 'en')}`
          : fr
            ? 'payé'
            : 'paid',
      ],
      ...(mine ? { myMoney: myMoneyLine(ctx, mine).text } : {}),
    };
  },

  async overview(ctx, input) {
    if (input.scope === 'group' && ctx.groupId) {
      const { dueTotal: _dueTotal, ...rest } = await groupOverview(ctx, ctx.groupId);
      return rest;
    }
    const groups = await listMyGroups(ctx.userId);
    const out = [];
    let total = 0;
    for (const g of groups) {
      const { dueTotal, ...rest } = await groupOverview(ctx, g.group.id);
      total += typeof dueTotal === 'number' ? dueTotal : 0;
      out.push({ group: g.group.name, ...rest });
    }
    return { total: money(total, ctx.lang), groups: out };
  },

  async round(ctx, input) {
    const round = await roundOf(ctx, input.round);
    return {
      cycle: round.cycle,
      round: round.number,
      mode: round.mode,
      status: round.status,
      beneficiary: round.beneficiaryName,
      deadline: formatDateTime(round.dueAt, ctx.lang),
      payout: formatDateTime(round.payoutAt, ctx.lang),
      ...(round.contributionAmount !== null
        ? { contribution: money(round.contributionAmount, ctx.lang) }
        : {}),
      paid: `${round.paidCount}/${round.contributionCount}`,
      collected: money(round.collected, ctx.lang),
    };
  },

  async unpaid(ctx, input) {
    const round = await roundOf(ctx, input.round);
    const names = await namesOf(ctx);
    return {
      round: round.number,
      deadline: formatDateTime(round.dueAt, ctx.lang),
      unpaid: round.unpaidMembershipIds.map((id) => names.get(id) ?? '—'),
      count: round.unpaidMembershipIds.length,
    };
  },

  async payoutBreakdown(ctx, input) {
    const round = await roundOf(ctx, input.round);
    const found = await orNull(
      () => readPayoutBreakdown(ctx.userId, groupOf(ctx), round.number),
      NO_ROUND,
    );
    if (!found) throw agentError('ROUND_NOT_FOUND');
    const amounts: Record<string, string> = {};
    for (const [key, value] of Object.entries(found.breakdown)) {
      if (typeof value === 'number') amounts[key] = money(value, ctx.lang);
    }
    return {
      round: found.round,
      beneficiary: round.beneficiaryName,
      payout: formatDateTime(found.payoutAt, ctx.lang),
      ...amounts,
      debtsDue: money(found.debtsDue, ctx.lang),
    };
  },

  async funds(ctx) {
    const funds = await readFunds(ctx.userId, groupOf(ctx));
    return {
      generalFund: money(funds.generalFund, ctx.lang),
      solidarityFund: money(funds.solidarityFund, ctx.lang),
      availableForLoans: money(funds.availableForLoans, ctx.lang),
    };
  },

  async ledger(ctx, input) {
    const groupId = groupOf(ctx);
    let membershipId: string | undefined;
    if (input.member) {
      const who = await resolveMember(ctx, groupId, input.member);
      if ('outcome' in who) throw agentError('MEMBER_NOT_FOUND');
      membershipId = who.membershipId;
    }
    const from = day(input.from, false);
    const to = day(input.to, true);
    // When querying FINE_ASSESSED without a specific member, scope to the caller's own
    // membership so that group-level fine entries (e.g. reserve fund seeding) are excluded.
    const fineScope =
      !input.member && input.type === 'FINE_ASSESSED' ? ctx.membershipId : undefined;
    const page = await readLedger(ctx.userId, groupId, {
      limit: Math.max(1, Math.min(50, input.limit)),
      ...(membershipId ? { membershipId } : fineScope ? { membershipId: fineScope } : {}),
      ...(input.type && LEDGER_TYPES.has(input.type)
        ? { type: input.type as TransactionType }
        : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
    return {
      entries: await Promise.all(
        page.entries.map(async (entry) => {
          const entryAmount = entry.postings.reduce(
            (sum, p) => (p.amount > 0 ? sum + p.amount : sum),
            0,
          );
          let deadline: string | undefined;
          const meta = entry.metadata as { deadline?: unknown } | null;
          if (typeof meta?.deadline === 'string') {
            deadline = formatDateTime(new Date(meta.deadline), ctx.lang);
          } else if (entry.roundId) {
            const round = await getPrisma().round.findUnique({
              where: { id: entry.roundId },
              select: { dueAt: true },
            });
            if (round) deadline = formatDateTime(round.dueAt, ctx.lang);
          }
          return {
            seq: entry.seq,
            date: formatDateTime(entry.occurredAt, ctx.lang),
            what: ctx.lang === 'fr' ? entry.descriptionFr : entry.descriptionEn,
            amount: money(entryAmount, ctx.lang),
            ...(entry.type === 'FINE_ASSESSED' ? { fine: money(entryAmount, ctx.lang) } : {}),
            ...(deadline ? { deadline } : {}),
          };
        }),
      ),
      more: page.nextBefore !== null,
    };
  },

  async loans(ctx, input) {
    const groupId = groupOf(ctx);
    let membershipId: string | undefined;
    if (input.member) {
      const who = await resolveMember(ctx, groupId, input.member);
      if ('outcome' in who) throw agentError('MEMBER_NOT_FOUND');
      membershipId = who.membershipId;
    }
    const loans = await listLoans(ctx.userId, groupId);
    return {
      loans: loans
        .filter((loan) => !input.status || loan.status === input.status.toUpperCase())
        .filter((loan) => !membershipId || loan.borrower.membershipId === membershipId)
        .slice(0, 20)
        .map((loan) => ({
          loanId: loan.id,
          borrower: loan.borrower.name,
          mine: loan.borrower.membershipId === ctx.membershipId,
          amount: money(loan.principal, ctx.lang),
          months: loan.months,
          status: loan.status,
          ...(loan.totalDue !== null ? { totalToRepay: money(loan.totalDue, ctx.lang) } : {}),
          installments: loan.installments.map((i) => ({
            amount: money(i.amount, ctx.lang),
            dueAt: formatDateTime(i.dueAt, ctx.lang),
            status: i.status,
          })),
        })),
    };
  },

  async loanQuote(ctx, input) {
    const quote = await getLoanQuote(ctx.userId, groupOf(ctx), input, ctx.now);
    if (!quote.ok) {
      return {
        possible: false,
        reason: quote.code,
        ...('limit' in quote && typeof quote.limit === 'number'
          ? { limit: money(quote.limit, ctx.lang) }
          : {}),
      };
    }
    return {
      possible: true,
      amount: money(quote.principal, ctx.lang),
      months: quote.months,
      interest: money(quote.interest, ctx.lang),
      fee: money(quote.feeEstimate, ctx.lang),
      totalToRepay: money(quote.totalDue, ctx.lang),
      limit: money(quote.limit, ctx.lang),
      installments: quote.installments.length,
    };
  },

  async bids(ctx, input) {
    const round = await roundOf(ctx, input.round);
    const bids = await readBids(ctx.userId, groupOf(ctx), round.id, ctx.now);
    // In the group chat everyone reads the answer: a member's own sealed bid stays out (R8.6).
    const inGroup = ctx.channel === 'GROUP';
    return {
      round: bids.round,
      closesAt: bids.closesAt[ctx.lang],
      count: bids.count,
      ...(!inGroup && bids.mine ? { myBid: money(bids.mine.amount, ctx.lang) } : {}),
      ...(bids.bids
        ? {
            closed: true,
            bids: bids.bids.map((b) => ({ name: b.name, amount: money(b.amount, ctx.lang) })),
          }
        : { closed: false }),
    };
  },

  exportLedger(ctx, input) {
    groupOf(ctx);
    // The app downloads the file from the card; nothing of it passes through the model.
    return Promise.resolve({ format: input.format, ready: true });
  },

  async holdLine(ctx) {
    if (!ctx.groupId) return null;
    const groupId = ctx.groupId;
    const mine = await orNull(() => readMyMoney(ctx.userId, groupId), ['NO_ACTIVE_CYCLE']);
    return mine ? myMoneyLine(ctx, mine).hold : null;
  },

  async pay(ctx, input) {
    const groupId = groupOf(ctx);
    const dues = await listMyDues(ctx.userId, groupId);
    const oldestDueRound =
      dues.find(
        (d) => typeof d.roundNumber === 'number' && ['CONTRIBUTION', 'SOLIDARITY'].includes(d.kind),
      )?.roundNumber ?? undefined;
    const targetRoundNumber = input.round ?? oldestDueRound;
    const round = await roundOf(ctx, targetRoundNumber);
    const chosen = dues.filter(
      (d) =>
        (d.roundNumber === round.number && ['CONTRIBUTION', 'SOLIDARITY'].includes(d.kind)) ||
        (input.includeDueDebts === true &&
          !['CONTRIBUTION', 'SOLIDARITY'].includes(d.kind) &&
          d.dueAt.getTime() <= ctx.now.getTime()),
    );
    if (chosen.length === 0) throw agentError('NOTHING_TO_PAY');
    return requestPayment(
      ctx.actor,
      groupId,
      chosen.slice(0, 30).map((d) => d.id),
      'AGENT',
    );
  },

  async payDebts(ctx, input) {
    const groupId = groupOf(ctx);
    const dues = await listMyDues(ctx.userId, groupId);
    const debts = dues.filter((d) => !['CONTRIBUTION', 'SOLIDARITY'].includes(d.kind));
    const wanted = input.items?.length ? new Set(input.items) : null;
    const chosen = wanted ? debts.filter((d) => wanted.has(d.id)) : debts;
    if (chosen.length === 0) throw agentError('NOTHING_TO_PAY');
    return requestPayment(
      ctx.actor,
      groupId,
      chosen.slice(0, 30).map((d) => d.id),
      'AGENT',
    );
  },

  withdraw(ctx, input) {
    const amount = input.all || input.amount === undefined ? 'ALL' : input.amount;
    return requestWithdrawal(ctx.actor, groupOf(ctx), amount, 'AGENT');
  },

  requestLoan(ctx, input) {
    return requestLoan(ctx.actor, groupOf(ctx), input, 'AGENT');
  },

  async repayLoan(ctx, input) {
    const loans = await listLoans(ctx.userId, groupOf(ctx));
    const mine = loans.find(
      (loan) =>
        loan.borrower.membershipId === ctx.membershipId &&
        ['DISBURSED', 'OVERDUE'].includes(loan.status),
    );
    if (!mine) throw agentError('NOTHING_TO_PAY');
    return requestLoanRepayment(ctx.actor, mine.id, input.amount ?? 'NEXT', 'AGENT');
  },

  decideLoan(ctx, input) {
    return requestLoanDecision(
      ctx.actor,
      input.loanId,
      { decision: input.decision, reason: input.reason },
      'AGENT',
    );
  },

  async placeBid(ctx, input) {
    const round = await roundOf(ctx, input.round);
    return placeBid(ctx.actor, groupOf(ctx), round.id, input.amount, 'AGENT');
  },
};
