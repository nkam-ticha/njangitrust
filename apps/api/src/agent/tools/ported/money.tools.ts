// Money tools (spec 4.6) through the money port. The money modules (payments, withdrawals, payouts,
// loans, bids, ledger, funds) implement AgentMoneyPort; until then each tool answers UNAVAILABLE.
// When those modules land, these bindings can move into their own `<area>.tools.ts` unchanged.
import { agentPorts, type AgentMoneyPort } from '../../ports';
import type { AgentCtx } from '../../types';
import { ok, prepared, unavailable } from '../outcomes';
import { needGroup } from '../resolve-group';
import { SPECS } from '../specs';
import { implement, type ToolOutcome } from '../types';

async function withMoney(
  ctx: AgentCtx,
  fn: (port: AgentMoneyPort) => Promise<ToolOutcome>,
): Promise<ToolOutcome> {
  const port = agentPorts().money;
  if (!port) return unavailable('money', ctx.lang);
  return needGroup(ctx) ?? fn(port);
}

const read =
  (fn: (port: AgentMoneyPort, ctx: AgentCtx) => Promise<Record<string, unknown>>) =>
  (ctx: AgentCtx) =>
    withMoney(ctx, async (port) => ok(await fn(port, ctx)));

export const moneyTools = [
  implement(SPECS.get_my_overview, (ctx, a) =>
    // scope "all" works without an active group: totals across the member's groups.
    agentPorts().money
      ? agentPorts()
          .money!.overview(ctx, { scope: a.scope ?? 'group' })
          .then((d) => ok(d))
      : Promise.resolve(unavailable('money', ctx.lang)),
  ),
  implement(SPECS.get_round, (ctx, a) => withMoney(ctx, async (p) => ok(await p.round(ctx, a)))),
  implement(SPECS.list_unpaid, (ctx, a) => withMoney(ctx, async (p) => ok(await p.unpaid(ctx, a)))),
  implement(SPECS.get_payout_breakdown, (ctx, a) =>
    withMoney(ctx, async (p) => ok(await p.payoutBreakdown(ctx, a))),
  ),
  implement(
    SPECS.get_funds,
    read((p, ctx) => p.funds(ctx)),
  ),
  implement(SPECS.get_ledger, (ctx, a) =>
    withMoney(ctx, async (p) => ok(await p.ledger(ctx, { ...a, limit: a.limit ?? 20 }))),
  ),
  implement(SPECS.list_loans, (ctx, a) => withMoney(ctx, async (p) => ok(await p.loans(ctx, a)))),
  implement(SPECS.get_loan_quote, (ctx, a) =>
    withMoney(ctx, async (p) => ok(await p.loanQuote(ctx, a))),
  ),
  implement(SPECS.list_bids, (ctx, a) => withMoney(ctx, async (p) => ok(await p.bids(ctx, a)))),
  implement(SPECS.export_ledger, (ctx, a) =>
    withMoney(ctx, async (p) => {
      const format = a.format ?? 'csv';
      const data = await p.exportLedger(ctx, { format });
      return ok(data, { card: { type: 'LEDGER_EXPORT', groupId: ctx.groupId!, format } });
    }),
  ),
  implement(SPECS.pay, (ctx, a) =>
    withMoney(ctx, async (p) => prepared(await p.pay(ctx, a), ctx.lang)),
  ),
  implement(SPECS.pay_debts, (ctx, a) =>
    withMoney(ctx, async (p) => prepared(await p.payDebts(ctx, a), ctx.lang)),
  ),
  implement(SPECS.withdraw, (ctx, a) =>
    withMoney(ctx, async (p) => prepared(await p.withdraw(ctx, a), ctx.lang)),
  ),
  implement(SPECS.request_loan, (ctx, a) =>
    withMoney(ctx, async (p) => prepared(await p.requestLoan(ctx, a), ctx.lang)),
  ),
  implement(SPECS.repay_loan, (ctx, a) =>
    withMoney(ctx, async (p) => prepared(await p.repayLoan(ctx, a), ctx.lang)),
  ),
  implement(SPECS.decide_loan, (ctx, a) =>
    withMoney(ctx, async (p) => prepared(await p.decideLoan(ctx, a), ctx.lang)),
  ),
  implement(SPECS.place_bid, (ctx, a) =>
    withMoney(ctx, async (p) => prepared(await p.placeBid(ctx, a), ctx.lang)),
  ),
];
