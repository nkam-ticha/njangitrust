# NjangiTrust delivery stories and sprint timeline

**Prepared:** 15 November 2026 (Africa/Lagos, UTC+01:00)  
**Project:** `nkamtit/njangitrust`  
**Purpose:** publication-ready GitLab work items documenting delivered work, implementation time, and the current agent-assisted worktree.

## Traceability note

This report was prepared from the GitLab repository, local Git history, repository documentation, and the current shared worktree.

- GitLab already contains the original product stories (#1–#37) and the first progress report (#39).
- The new stories below document the additional implementation visible after that report.
- Git commit metadata records `Nkam Ticha` as the author for the committed changes. That is repository authorship, not proof that one person performed every edit.
- `docs/TEAM.md` defines lead, designer, money-engineer, and platform-engineer ownership. `CLAUDE.md` contains the Claude Code project instructions. The current worktree also contains agent runtime, evaluation, chat, media, meetings, statements, and ledger-hardening work.
- Where the work is not committed, the exact edit time and individual agent attribution are not recoverable from Git. Those items are marked explicitly instead of being guessed.

## Sprint timeline

| Sprint | Implementation window (Africa/Lagos) | Main outcome | Evidence/status |
|---|---|---|---|
| Sprint 1 | 2–11 Nov 2026 | Specification, foundations, first rules/API/mobile baseline | Existing GitLab issue #39 |
| Sprint 2 | 14 Nov 2026, 22:32:10–22:32:24 | Rules engine, ledger, money domain, governance rules, exports and invariant tests | Committed; see Story 1 |
| Sprint 3 | 14 Nov 2026, 22:32:26–22:32:31 | Shared contracts, translations, data model, migrations and platform safeguards | Committed; see Story 2 |
| Sprint 4 | 14 Nov 2026, 22:32:33–22:32:47 | API security, identity, permissions, groups, governance, notifications, realtime, jobs and storage | Committed; see Stories 3–4 |
| Sprint 5 | 14 Nov 2026, 22:38:17–22:38:55 | Mobile experience, demo tooling, runbook and decision updates | Committed; see Stories 5–6 |
| Sprint 6 | 15 Nov 2026, 06:52:59–14:57:32 | Member date/time parsing and Vercel/Supabase deployment hardening | Committed; see Story 7 |
| Sprint 7 | Snapshot observed 15 Nov 2026; exact edit times unavailable | Agent-assisted expansion and ledger hardening in the uncommitted worktree | In progress/uncommitted; see Story 8 |

---

## Story 1 — Rules engine and trustworthy ledger

**User story**  
As a njangi member, I want every contribution, payout, loan, vote, fee and correction to follow explicit, testable rules so that the group’s money remains explainable and auditable.

**Sprint/time:** Sprint 2 — 14 Nov 2026, 22:32:10–22:32:24.

**Delivered**

- Douala calendar and round scheduling.
- Versioned rule sets and effective-change timing.
- Rotation ordering and verifiable draws.
- Collection-fee splitting and double-entry ledger posting builders.
- Hash-chain integrity checks and ledger validation.
- Contributions, obligations, payout settlement, withdrawal checks and member-exit settlement.
- Loan quotes and installment schedules.
- Solidarity-fund payouts and proposal/vote rules.
- Bilingual rule registry.
- Ledger export format, export verification and the `verify-ledger` command.
- Worked examples and property-based/invariant test support.

**Acceptance criteria**

- [x] Money calculations are isolated in `packages/rules` as pure functions.
- [x] Ledger postings balance and form a tamper-evident hash chain.
- [x] Export verification is available as a reusable tool and CLI.
- [x] Worked examples and invariant tests cover the implemented rule families.
- [ ] A clean-worktree audit and full verification run remain a release gate for the current combined worktree.

**Evidence:** commits `467dce8` through `b3c4ad4` and `60c5079`.

---

## Story 2 — Shared contracts, localization and database foundations

**User story**  
As a client and service developer, I want one shared contract and localization layer backed by a protected database model so that mobile and API behavior cannot silently diverge.

**Sprint/time:** Sprint 3 — 14 Nov 2026, 22:32:26–22:32:31.

**Delivered**

- Shared API contracts and server-side French/English translations.
- More robust phone-number detection when separators split a number.
- Formatting and shared utility cleanup.
- Domain Prisma schema, migrations and database protections across identity, groups, money, ledger, governance, notifications, chat, meetings, agent and audit data.
- Ledger immutability/protection mechanisms and test-database setup foundations.

**Acceptance criteria**

- [x] API and mobile-facing types are defined in shared packages.
- [x] User-facing server messages support French and English.
- [x] Money is represented as integer FCFA values in the data model.
- [x] Database migrations and ledger protections are versioned in the repository.
- [ ] Final migration rehearsal against the selected deployment database remains outstanding.

**Evidence:** commits `bec4acf`, `5bf857f`, `038884d` and `c9d7fe9`.

---

## Story 3 — Secure identity, permissions and confirmed actions

**User story**  
As a member, I want secure sign-up, PIN login, session control and confirmation cards so that neither an AI model nor an unauthorized caller can move money or change my group.

**Sprint/time:** Sprint 4 — 14 Nov 2026, 22:32:33–22:32:38.

**Delivered**

- Configuration validation, logging, redaction, cryptography and HTTP middleware.
- PIN authentication, sessions, refresh-token handling, lockout and PIN-reset protection.
- Device/session management.
- Permission checks and audience-specific response mappers.
- Pending-action preparation, confirmation, expiry and execution flow.

**Acceptance criteria**

- [x] PINs, tokens and phone numbers are excluded from sensitive logs.
- [x] Authenticated requests are checked against the member session and permissions.
- [x] Money and group-changing actions require a server-generated pending action and member confirmation.
- [x] API responses are mapped to the audience instead of exposing raw domain records.
- [ ] Final clean-worktree privacy review remains required after the current agent changes.

**Evidence:** commits `2b3e29a`, `983f7bf`, `8d9e516` and `7addf6c`.

---

## Story 4 — Group operations, governance, communication infrastructure and tests

**User story**  
As a group member, I want to manage membership, vote transparently, receive notifications and use reliable realtime services so that the group can operate without manual coordination.

**Sprint/time:** Sprint 4 — 14 Nov 2026, 22:32:41–22:32:47.

**Delivered**

- Group creation, invitations, members, rulesets and solidarity endpoints.
- Governance proposals, typed proposal definitions, threshold handling and secret voting.
- In-app notifications, preferences, push delivery and delivery jobs.
- Realtime rooms and authorization, job queues/dispatch, and local/S3 file-storage abstractions.
- API test database setup, factories, fake money provider, permission matrix and flow helpers.

**Acceptance criteria**

- [x] Membership and governance operations are exposed through the service layer.
- [x] Secret ballots do not link a ballot choice to the voter.
- [x] Notifications are written in-app before optional push delivery.
- [x] Realtime, queue and storage behavior has dedicated test coverage and interfaces.
- [ ] CI automation and a clean end-to-end run are still required before calling the release production-ready.

**Evidence:** commits `740fda9`, `1cdf031`, `62f5da1`, `f413ffe` and `e4c0f70`.

---

## Story 5 — Mobile member experience and design system

**User story**  
As a member using an entry-level phone, I want a clear bilingual mobile experience for account access, groups, votes, notifications and confirmations so that I can operate my njangi without needing a desktop.

**Sprint/time:** Sprint 5 — 14 Nov 2026, 22:38:17–22:38:46.

**Delivered**

- French and English interface copy.
- Design tokens, typography, colors, spacing, motion and font assets.
- Reusable buttons, fields, lists, sheets, confirmation cards, money displays, identity components and feedback states.
- NjangiRing visual component and motion/geometry support.
- Chat and agent UI components.
- Development gallery and progress screens.
- API client, session handling, i18n setup and Expo/iOS permission configuration.
- Welcome, sign-up, login, PIN reset, invitation, group creation, founding-member, rules, member, vote and notification screens.

**Acceptance criteria**

- [x] Core member flows have mobile routes and reusable UI primitives.
- [x] The interface has French/English parity for the delivered copy.
- [x] Sensitive actions are represented with confirmation UI rather than free-form AI confirmation.
- [ ] Final device QA against the current API and a clean mobile type-check remain release gates.

**Evidence:** commits `1dc77a9`, `2ec46bc`, `e443d35`, `f627301`, `f0ba1f4`, `fa379f5`, `7057de9`, `d1ede74`, `938e0af`, `2d34ed2` and `f81ca30`.

---

## Story 6 — Repeatable demo, documentation and project decisions

**User story**  
As a reviewer or teammate, I want one-command demo startup, seeded data and an up-to-date runbook so that I can reproduce and evaluate the project consistently.

**Sprint/time:** Sprint 5 — 14 Nov 2026, 22:38:48–22:38:55.

**Delivered**

- One-command demo startup.
- Demo data seeding and QR/demo helpers.
- Guide for running the application.
- Decisions D14–D22 recorded.
- Local QA and scratch folders excluded from version control.

**Acceptance criteria**

- [x] A reviewer can follow the runbook to start the demo.
- [x] Demo data can be seeded through the repository tooling.
- [x] Decisions made after the first sprint are recorded and discoverable.
- [ ] CI is still not represented in the committed history and should be added as a separate delivery item.

**Evidence:** commits `de6c67d`, `42d6da7`, `b7a656f`, `4cfb41f` and `e4143ab`.

---

## Story 7 — Deployment preparation and runtime hardening

**User story**  
As an operator, I want the web and API deployments to build as self-contained Vercel functions and remain healthy with Supabase so that the application can be deployed without relying on local infrastructure.

**Sprint/time:** Sprint 6 — 15 Nov 2026, 06:52:59–14:57:32.

**Delivered**

- Member-written date/time parsing support in shared text handling.
- Vercel and Supabase runtime preparation.
- Startup behavior that keeps the app online when realtime credentials are absent.
- Vercel-managed Node runtime configuration.
- Compiler-output allowances and bundled Vercel API entrypoints.
- API static output directory configuration.
- Health endpoint exemption from the shared rate limiter.
- Deployment handoff documenting the Supabase TLS compatibility fix.

**Acceptance criteria**

- [x] Web and API build configuration is represented in the repository.
- [x] The API entrypoint and static output paths are explicit for Vercel.
- [x] Health checks can run without being blocked by normal request throttling.
- [x] The Supabase connection-string TLS requirement is documented.
- [ ] No production deployment, migration or data import has been performed; a reviewed commit must be deployed and verified separately.

**Evidence:** commits `587a2f9`, `2d4e11f`, `a10c68c`, `4449704`, `d912483`, `fe78afb`, `c5e6ba6`, `252d8df`, `33b3190`, `b204b2c`, `3d0ddf7` and `10cadcf`.

---

## Story 8 — Agent-assisted expansion and current shared worktree

**User story**  
As the project owner, I want work produced by the shared team and coding agents—including Claude Code—to be visible in the delivery record even before it is committed, so that the project history reflects the actual state of the build.

**Sprint/time:** Sprint 7 — snapshot observed 15 Nov 2026. Exact edit times are not recoverable because the changes are not committed.

**Present in the worktree**

- Agent runtime, prompts, tool contracts, guards and evaluation scenarios under `apps/api/src/agent`, `packages/shared/src/contracts/agent.ts`, server i18n and `tools/agent-eval`.
- Group/private chat service, routes, messages, read state, notifications, agent port and chat test helpers.
- Media upload/storage modules and media test helpers.
- Meetings, attendance, agendas and meeting helpers.
- Statements and statement-generation support.
- Additional agent-facing tools for groups, invites, members, notifications, proposals, rulesets, solidarity and self-service.
- Ledger/rules hardening for corrections, correction debts, clawback/release, daily checks, refunds, reversal-of-reversal, safe ranges, disbursement/in-flight checks and solidarity history.
- Additional scenario support, verifier tests and ledger seed/staging helpers.

**Current repository state**

- Git status shows 36 modified tracked files and 170 untracked paths.
- The work is not yet a reviewed commit and must not be treated as deployable evidence until tests, privacy review, ledger audit and a clean commit are complete.
- The Git history cannot identify which individual agent made each edit. The record therefore attributes this story to the shared team/agent-assisted worktree, with Claude Code explicitly represented by the repository’s `CLAUDE.md` instructions.

**Acceptance criteria**

- [x] Agent-assisted areas are named and included in the project record.
- [x] Attribution limits are documented honestly.
- [ ] Run the full rules/API/mobile/agent evaluation suite on a clean worktree.
- [ ] Resolve any failures, complete privacy and ledger reviews, and commit the work in small feature commits.
- [ ] Publish the resulting commit to the selected GitLab branch before deployment.

**Evidence:** current `git status`, `docs/TEAM.md`, `CLAUDE.md`, `docs/VERCEL_SUPABASE_HANDOFF.md`, and the uncommitted paths listed by Git.

---

## Publication checklist for GitLab

- [ ] Create milestones Sprint 2 through Sprint 7 with the dates/windows in the timeline.
- [ ] Create one GitLab user story for each story above and assign its matching sprint milestone.
- [ ] Keep Story 8 open until the worktree is reviewed and committed.
- [ ] Link the new stories to existing issue #39 and, where appropriate, to the original product stories #1–#37.
- [ ] Add CI as a separate follow-up story if it is not implemented during the next reviewed commit.
