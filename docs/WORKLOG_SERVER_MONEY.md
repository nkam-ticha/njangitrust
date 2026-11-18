# Server money phase handoff

**Updated:** 15 November 2026 (Africa/Lagos)  
**State:** active work in the shared worktree; no commit created.

## Scope and starting point

The requested slice, “Server: money (payments, withdrawals, payouts, loans, bids, fines),” maps to technical-spec Phases 2, 3 and 6. The API money services had not started when this work began. The pure `packages/rules` domain, Prisma money schema/migrations, provider configuration, PendingAction framework, and governance/agent ports were already present. A large unrelated and money-rules uncommitted worktree existed; preserve it.

The FSD is the behavior source. Read FSD sections 4.3–4.6 and 5, plus `docs/NJANGI_SPEC.md` sections 2.4–2.9, 2.11, 3.3–3.9 and build plan Part 6, along with `docs/DECISIONS.md` D10–D22. Solidarity is deferred to Phase 8 in the technical build plan and is outside this requested slice.

## Implemented or in progress

- `apps/api/src/modules/ledger`: append-only ledger persistence with group-row locking, hash-chain sealing and head lookup.
- `apps/api/src/modules/providers`: `PaymentProvider` interface and deterministic `MockProvider`. CamPay is deliberately deferred to Phase 9.
- `apps/api/src/modules/payments`: PAY PendingAction, collection service/routes and status polling/settlement jobs.
- `apps/api/src/modules/rounds`: current/detail reads and payout-breakdown read route.
- `apps/api/src/modules/cycles`: first-cycle creation, round scheduling, round-open scan, and obligation creation.
- `apps/api/src/modules/payouts`: due-debt settlement, payout-open scan, withdrawal PendingAction, in-flight ledger entries, status polling and own-withdrawal read.
- `apps/api/src/modules/loans`, `bids`, `fines`: agent-created service/action/route/job files are present. Loan disbursement scheduling and D18 ledger flow are being integrated in `loans.disbursement.ts` and the payout provider service.

## Milestone: services, endpoints and startup wiring

Completed in the shared worktree on 15 November 2026; still uncommitted:

- Mounted round, payment, withdrawal, loan, bid, ledger, fund-balance and audit-export routes in `apps/api/src/http/router.ts`.
- Registered PAY, WITHDRAW, REQUEST_LOAN, DECIDE_LOAN and PLACE_BID PendingAction handlers, plus payment, payout, disbursement, cycle, fine, loan-disbursement and bid-close jobs in `apps/api/src/modules/register.ts`.
- Cycle start now calls the money cycle service directly. Governance ledger events are connected to the append-only ledger service.
- Payment settlement now runs due-debt auto-settlement for every beneficiary whose payable was credited, inside the same transaction; it also marks fully repaid loans when no installment remains due.
- Provider operations in EXPIRED state remain reserved and are polled daily after 24 hours. Unknown provider status never releases money or permits another withdrawal.
- Unresolved expired collections remain reserved against their obligations indefinitely, preventing a second collection while a late provider success is still possible. Provider status-check errors are rescheduled instead of consuming finite queue retries.
- Loan installment attempts are blocked while their loan is approved or its disbursement is unresolved. Withdrawal, payment and fine logic now treat an expired loan disbursement as in-flight.
- Approved loans that cannot yet be disbursed are rechecked hourly. Failed provider sends leave approved installments in place but fine assessment waits until disbursement succeeds.
- Admin self-loans use the existing ADMIN_LOAN proposal: a passed vote recalculates/fixes terms at approval and schedules disbursement; rejected/expired votes reject the request.
- No changes have been committed.

## Remaining work / explicit boundaries

1. Implement and register the rest of `MoneyGovernancePort`: fine waiver, rule changes, rotation changes, exit settlement, ledger correction and solidarity payout. The broader port remains `null`; admin self-loans are integrated directly through the loan service. Cycle start is handled directly by the cycle service.
2. Implement/register `AgentMoneyPort` so the FSD's money agent tools stop returning UNAVAILABLE. This belongs to the agent-tools integration slice, though it consumes these server modules.
3. Implement daily reconciliation and its latest-result route/alert flow. The current withdrawal and loan checks honor a stored reconciliation ALERT, but this work does not generate daily runs.
4. Notifications and realtime events for newly added payment/withdrawal/fine/payout lifecycle transitions need a separate integration against existing notification/event contracts.
5. CamPay is intentionally deferred to Phase 9; the provider interface and MockProvider are present. Do not enable real-money operation until the provider implementation, webhook/status behavior and reconciliation are complete.
6. Inspect the remaining FSD acceptance criteria and decisions before extending beyond this requested server slice. Preserve the pre-existing dirty worktree and do not commit.

## Important invariants

- Money is integer FCFA; calculations remain in `@njangi/rules`.
- Every move uses a server-built PendingAction preview and member confirmation.
- Provider references are stable and status is rechecked before retry. Do not release in-flight balances based on timeout alone.
- Ledger entries are balanced, hash-chained and append-only. Never mutate/delete ledger rows.
- Reconciliation ALERT blocks withdrawals and loan disbursements; new-number/PIN-reset holds apply to all disbursements.
- Use current group/membership ownership at execution; only a member's own payment number can receive their disbursement.
- User explicitly said not to commit. Keep working in the shared tree.

## Verification state

API TypeScript compilation (`node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit`) passed after route/startup integration and after the final provider, repayment and retry changes. Tests were not run. `pnpm` attempted workspace resolution and encountered registry TLS certificate failures, so use the existing local `tsc.cmd` executable for compile checks. The MockProvider is process-local and intended for local/demo use; no real-provider implementation is included in this phase.
