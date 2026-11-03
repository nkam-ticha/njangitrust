# NjangiTrust: instructions for Claude Code

The full specification is `docs/NJANGI_SPEC.md`. Before each task, re-read the parts it touches. If the spec and this file disagree, stop and ask.

## What we are building

A mobile app (Expo, React Native, TypeScript) for njangi (tontine) groups in Cameroon. Members do everything by talking to an AI agent called Njangi, or with screens: pay contributions through Mobile Money, withdraw payouts, borrow from the group fund, vote on every change, and chat. Backend: Node.js, Express, PostgreSQL with Prisma, Redis with BullMQ, Socket.IO. AI: OpenRouter with tool calling.

## Repository

- `apps/mobile`: Expo app
- `apps/api`: API, services, agent runtime, jobs
- `packages/rules`: pure rules engine (no I/O, no clock)
- `packages/shared`: types, zod schemas, formatXAF, maskNumber
- `tools/verify-ledger`, `tools/agent-eval`

## Commands

Windows, pnpm workspaces. No Docker locally (docs/DECISIONS.md D2). On this network IPv6 is broken: run installs with `$env:NODE_OPTIONS='--dns-result-order=ipv4first'`.

| Task | Command |
|---|---|
| Install | `pnpm install` (only the lead installs; see docs/TEAM.md) |
| Start local services | `pnpm services:start` (Redis in WSL; PostgreSQL 16 runs as a Windows service), `pnpm services:status` |
| First-time database setup | `apps/api/scripts/setup-db.ps1` (creates roles and databases, writes `apps/api/.env`) |
| Migrate | `pnpm db:migrate` |
| Seed demo data | `pnpm db:seed` |
| API in dev | `pnpm dev:api` |
| App on Android (Expo Go) / web | `pnpm dev:mobile` / `pnpm dev:web` |
| Tests | `pnpm test` (rules only: `pnpm test:rules`) |
| Lint / type-check / format | `pnpm lint` / `pnpm typecheck` / `pnpm format:check` |
| Agent evaluation | `pnpm agent:eval` |
| Verify a ledger export | `pnpm verify-ledger <export.json>` |

Also read `docs/DECISIONS.md` (decisions that override the spec) and `docs/TEAM.md` (structure, ownership, conventions).

## Rules that must never be broken

1. Money is an integer number of FCFA. No floating-point arithmetic in money code. Format amounts only with `formatXAF`.
2. Every money and rules calculation lives in `packages/rules` as a pure function, with tests written first. Services call it; nothing else calculates money.
3. The ledger is double-entry (postings sum to zero), append-only and hash-chained. Never UPDATE or DELETE ledger rows. Corrections are REVERSAL entries.
4. One service layer. REST routes and agent tools only validate input, call services and map output. No business logic in routes or tools.
5. Every action that moves money or changes the group goes through a PendingAction that the member confirms in the app. The LLM can never confirm.
6. Permissions live in code: `can(actor, action, resource)` and allowlist DTO mappers. Other members' phone numbers never leave the server. Secret ballots are never linked to voters.
7. The LLM has no raw database access. Tools act only as the member in `ctx` and return minimal data.
8. Payment providers are used only through the `PaymentProvider` interface. `PAYMENT_PROVIDER=mock` by default. Always re-check a payment's status before any retry.
9. Store times in UTC; schedule and display them in Africa/Douala.
10. Every user-facing text exists in French and English through i18n keys. French uses "tu".
11. No secrets in code. Logs redact PINs, tokens and phone numbers.
12. Use only the design tokens and fonts from spec section 1.2.

## How we work

- Build phase by phase (spec Part 6). Start each phase in plan mode and wait for approval.
- Write rule tests before rule code. Examples E1 to E10 (spec 3.17) must pass to the franc.
- After money changes, run the `ledger-auditor` subagent. After changes to responses, tools, prompts or logs, run `privacy-guard`. Before every commit, run `test-runner`.
- Ask before adding a dependency that isn't listed in spec 1.1 or 2.2.
- Keep commits small, one feature each, with a clear message.

## Vocabulary

cotisation (contribution), tour (round), bénéficiaire (beneficiary), caisse générale (general fund), caisse de secours (solidarity fund), amende (fine), prêt (loan), enchère (bid), relevé (statement), procès-verbal (minutes), registre (records).
