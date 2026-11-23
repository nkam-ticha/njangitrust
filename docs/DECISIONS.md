# Decisions

Decisions made with the project owner (Nkam Ticha) that change or complete `docs/NJANGI_SPEC.md`. Where this file and the spec disagree, this file wins. Every agent reads it before working.

## D1. Web version is in scope (2026-11-02)

The spec (1.1, Out of scope) excludes a web version. The owner asked for **Android and web from the same code, with the same design, perfect on both**.

- Built with Expo's web target (`react-dom`, `react-native-web`, `@expo/metro-runtime`).
- Same components and same design language. At phone widths the web app is identical to Android. On wider screens the layout adapts (see `docs/design/DESIGN_SYSTEM.md`, responsive section) without changing components.
- **Auth on web:** the refresh token is an `httpOnly`, `Secure`, `SameSite=Strict` cookie scoped to `/v1/auth`; the access token lives in memory only. Never `localStorage` for tokens. State-changing requests from the web client carry a custom header that the API requires (CSRF defence on top of SameSite). CORS allows only configured web origins.
- **Notifications on web:** in-app notifications and realtime only (no push). Every push already creates an in-app notification (1.8), so nothing is lost.
- Phone-only features: push, biometric unlock, screenshot blocking. On web they are hidden, not broken.
- iOS still ships from the same code later; Android and web are what we test.

## D2. No Docker for local development (2026-11-02)

Docker Desktop is too heavy on the owner's machine.

- **PostgreSQL:** the owner's installed PostgreSQL 16 on `localhost:5432`. A one-time script (`apps/api/scripts/setup-db.ps1`, run by the owner) creates the database and two roles:
  - `njangi_owner`: owns the schema, used only by migrations;
  - `njangi_app`: used by the API at runtime. It has **no UPDATE and no DELETE on `LedgerTransaction` and `LedgerPosting`** (spec 2.5). A trigger also blocks UPDATE/DELETE on those tables for every role (defence in depth).
  The postgres superuser password is typed by the owner into the script prompt and never written to disk or shared in chat.
- **Redis:** `redis-server` inside the owner's `kali-linux` WSL distro, reached at `localhost:6379`. `pnpm services:start` starts it.
- **Object storage:** a `StorageProvider` interface with two drivers: `local` (development; files on disk, short-lived HMAC-signed upload and download URLs served by the API) and `s3` (any S3-compatible service, production). Same semantics as spec 2.12.
- `docker-compose.yml` is still provided for other contributors and CI, but nothing requires it locally.

## D3. Build straight through (2026-11-02)

The owner asked to build all phases of Part 6 without stopping for a plan approval at each phase. Every other rule in `CLAUDE.md` still applies: tests before rule code, E1 to E10 exact to the franc, `ledger-auditor` after money changes, `privacy-guard` after response/tool/prompt/log changes, `test-runner` before every commit, small commits, and asking before any new dependency.

## D4. Approved dependencies beyond spec 1.1 and 2.2 (2026-11-02)

- Plumbing: `expo-localization`, `jose`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `ioredis`, `fast-check`, ESLint, Prettier (and their TypeScript configs/plugins).
- Server hardening: `helmet`, `rate-limiter-flexible`.
- Phone security: `expo-local-authentication` (app unlock only; L2 actions still require the PIN), `expo-screen-capture` (block screenshots on PIN and money screens).
- Web (from D1): `react-dom`, `react-native-web`, `@expo/metro-runtime`.
- Database: `@prisma/adapter-pg` (Prisma's official PostgreSQL driver adapter, required by recent Prisma versions; brings `pg`).
- Offline (2026-11-02): `expo-network` (Wi-Fi or mobile data, for Wi-Fi-only media), `@react-native-async-storage/async-storage` and `@tanstack/query-async-storage-persister` (the last known data survives an offline restart, spec 1.7). The query cache is persisted on phones only, never on web, and is wiped at log-out. Tokens and PINs are never stored there.
- Standard companions installed by `expo install` for Expo Router (`react-native-screens`, `react-native-safe-area-context`, `expo-linking`, `expo-constants`, `expo-status-bar`, `expo-splash-screen`, `expo-system-ui`) and dev tooling (`tsx`, `@types/*`).
- **Not approved:** `react-native-reanimated`, `react-native-gesture-handler`. Motion uses React Native's `Animated` API. Bottom sheets are built in-house.
- Anything else: stop and ask.

## D5. Colour use: `pending` (2026-11-02)

`pending` (#A86A0B) reaches only 4.11:1 on `cloud` and 4.44:1 on white, and white on `pending` is 4.44:1. It fails the 4.5:1 text rule, so, like `raffia`, it is used **only for non-text marks** (dots, icons, borders, progress), where it passes the 3:1 non-text rule. Status text next to it is `indigoInk`. Dark-mode values for every token are defined by the designer and every pair is verified by script.

## D6. Ledger hash content (2026-11-02)

`canonicalJSON(transaction without hash)` includes the transaction's postings, sorted by `account` then `amount`, so tampering with a posting breaks the chain (spec 5.2). Dates are ISO 8601 UTC strings. Canonical JSON: sorted keys, no whitespace, integers only.

## D7. Models added to spec 2.4 (2026-11-02)

The spec's features need a few tables it doesn't list: `RefreshToken` (rotation with reuse detection, "log out everywhere"), `PinReset` (2.10), `NotificationPrefs` (1.8 categories, quiet hours, chat mute, Wi-Fi media setting), `UploadTicket` (presigned uploads, 2.12). Login lockout counters live in Redis.

## D8. Admin's own PIN reset (2026-11-02)

Spec 2.10 has the admin confirm a PIN reset. When the person who forgot their PIN is the admin, **two other active members of the group** each confirm in the app that they know the admin; neither can do it alone. The rest of the flow is unchanged (one-time 30-minute link, logged, the group is told, withdrawals held for `numberChangeHoldHours`).

## D9. Design questions settled (2026-11-02)

From `docs/design/DESIGN_SYSTEM.md` section 15:
- Fonts: the four static TTF files (OFL) are committed to `apps/mobile/assets/fonts/` with their licence; no font package.
- App icon and splash: PNGs exported once from the SVGs by the lead, committed to `apps/mobile/assets/brand/`.
- Statement verification address: `PUBLIC_BASE_URL` + `/verify`, shown without "https://".
- The WARNING daily-check state is shown to members, calmly, with its explanation.
- Chat images: the phone also uploads a 320 px thumbnail so Wi-Fi-only placeholders show a real preview.
- Privacy notice (FR and EN, versioned): legal text supplied by the owner before Phase 9.

## D10. Bidding-mode pot account (2026-11-03)

In BIDDING mode contributions arrive before the beneficiary is known. They are credited to a per-round holding account `pot:round:<roundId>` (a liability, never lendable, counted as reserved in "available for loans"). When bidding closes, one `POT_ASSIGNED` transaction moves the whole pot to the winner's `payable:member:<m>`. This extends the account and transaction tables of spec 2.5.

## D11. 100 FCFA minimum applies to withdrawals only (2026-11-03)

R5.4's minimum of 100 FCFA applies only to withdrawals, as the spec says. Loans and solidarity payouts have no minimum beyond being positive and fitting the available money and fee.

## D12. Ledger technical choices (2026-11-03)

- `createdAt` (set by the database at insert) is not part of a transaction's hashed content; `occurredAt` is, and is set by the ledger service before sealing. `verify-ledger` refuses any transaction field outside the hashed list, so every recorded field is protected.
- `loanLimitFactor` is stored as `loanLimitFactorPermille` (1000 = 1.0) so no float enters money code; it is shown to members as a factor ("1,5 fois").
- PAYMENT_RECEIVED keeps one posting per payment part (no merging), with per-part metadata so each posting traces to its obligation.

## D13. Settled from the owner's FSD (2026-11-04)

The owner's Functional Specification Document is transcribed in `docs/FSD.md`. Its acceptance criteria AC-01 to AC-12 are the project's acceptance tests. Where the FSD and the technical spec differ, the FSD wins on **what** the system does.

1. **Rule changes take effect from the next round, for every parameter** (FSD section 6, GOV-04, AC-05). This replaces spec R11.1's "rotation mode and frequency: next cycle" and R8.1. Concretely:
   - frequency or payout-time changes re-date the remaining rounds of the current cycle from the next round;
   - FIXED → BIDDING lets the members not yet served bid for the next round;
   - BIDDING → FIXED runs a verifiable draw (R2.3 method) among the members not yet served for the remaining rounds.
2. **Monthly rounds keep the first payout's anchor** (Q1 proposal confirmed by default; the FSD only says "Monthly"): a day of the month clamped to the month's last day, the last weekday, or the nth weekday.
3. **Due debts at payout (CAI-03).** Due debts are deducted before any money becomes available:
   - whole debts, strictly oldest first (winning bid, fines, due installments);
   - if the next due debt is larger than what is left, nothing more is taken, and an amount equal to the uncovered due debts stays unavailable for withdrawal until it is covered.
   
   No partial obligations (R3.2), and a member never withdraws money they owe.
4. **Leaving mid-cycle with a loan (LOA-02, MEM-02).** A leaver's whole remaining loan balance becomes due at exit and is deducted from their refund and payable before they can withdraw ("deducted from any payout the borrower receives").
5. **Payment-number hold covers every payout to the new number** (NUM-02, Flow D): withdrawals, loan disbursements and solidarity payouts all wait `numberChangeHoldHours`. A passed solidarity vote is paid when the hold ends.
6. **Loan installments are monthly (LOA-02).** Installment k is due at the deadline (`dueAt`) of the first round whose deadline falls on or after the approval date plus k months. For monthly groups this is spec R7.3 exactly.
7. **The FSD lists the web version as out of scope (2.4).** D1 (web in scope, at the owner's request) still stands; the owner may update the FSD.

## D14. PIN reset protection (2026-11-04)

Closes the privacy-guard finding that a single admin who knows a member's phone could reset that member's PIN and take over the account. In addition to ACC-04 and D8:
- The account owner gets a SECURITY notification on every logged-in device when a reset is requested and when it is approved, with a "Cancel" action. Cancelling ends the request and is logged.
- The one-time reset link only works after a 24-hour waiting period from approval (the 30-minute link validity starts when the wait ends).
- The two-member confirmation of D8 applies whenever the person is an admin of any group that isn't closed.

## D15. Reversals, self-votes and loan length (2026-11-06)

1. **Pot payment reversed after the pot was assigned (bidding mode).** `POT_CORRECTION` moves the amount back from the winner's payable to the pot before the payment's REVERSAL. If the winner's payable no longer holds the amount (already withdrawn), the missing part becomes the winner's debt to the group (a receivable, settled automatically from their next payout like a fine, or paid by request). The general fund never absorbs it.
2. **The member concerned does not vote on their own case.** FINE_WAIVER excludes the fined member and EARLY_EXIT excludes the person leaving, as in spec R11.1. The FSD table's "Majority" counts the other eligible members.
3. **Loan length:** default maximum 3 months as in the FSD; `loanMaxMonths` stays a group rule that a two-thirds vote can raise up to 6 (spec 3.2).

## D16. Reversals after payout, reserved coverage, installment dates (2026-11-06)

1. **Every reversal of money already paid out becomes the recipient's debt** (extends D15.1 to FIXED-mode beneficiaries, solidarity recipients and leavers' shortfall refunds): the recipient's payable is debited as far as it holds, the rest becomes their receivable, settled by auto-settlement from their next payout or paid by request. The general fund never absorbs it.
2. **Reserved-money coverage is checked every day:** if cash at the provider is below `payables + pots + solidarity fund`, the daily check is ALERT and all withdrawals and disbursements in the group pause (R5.5, CAI-05) until it is resolved.
3. **Loan installment dates (replaces D13.6):** in monthly groups, installment k is due at the deadline of the k-th round after approval (spec R7.3). In weekly or two-weekly groups, installment k is due at the first round deadline on or after approval + k calendar months (LOA-02 "monthly installments").

## D17. CLAWBACK entries and solidarity shortfalls (2026-11-06)

1. **`CLAWBACK` transaction type approved.** Posted just before a REVERSAL of money already paid out (D16.1): it moves what a member's payable, or the solidarity fund, no longer holds into the recipient's receivable, so the REVERSAL can follow without any balance going negative. Extends the transaction table of spec 2.5, like POT_ASSIGNED and POT_CORRECTION (D10, D15).
2. **Solidarity shortfall debtor:** when the reversed payment's solidarity part has already been paid out of the fund, the recipient of the most recent solidarity payout owes the missing amount as a debt.

## D18. In-flight money, cross-cycle installments, solidarity cap (2026-11-09)

1. **Withdrawals and other disbursements in flight are recorded in the ledger.** When a disbursement is sent to the provider, an entry moves the amount plus the estimated fee from the member's payable (or the solidarity fund, or the general fund for a loan) to an in-flight account for that operation; the provider's confirmation completes it from there (actual fee reconciled as in R4.3), and a failure returns it. Members see pending withdrawals in the ledger, and no correction ever relies on a self-declared in-flight figure. Extends the spec 2.5 tables.
2. **Loan installments that fall after the cycle ends** are re-dated when the next cycle starts (to the corresponding round deadlines of the new cycle); until then the member sees "due at a round of the next cycle".
3. **Solidarity shortfall debt is capped (refines D17.2):** a recipient never owes more than the payout they received. Any rest is owed by the previous recipient, and so on backwards; if no recipient remains, the member whose payment was reversed owes it again.

D18.3 details (confirmed 2026-11-11): the cap is the full voted payout (the fee was the recipient's cost of receiving it, FEE-01), and only payouts the operator has confirmed count as "received"; a payout still in flight makes its recipient owe nothing yet.

## D22. Refunded payouts and correction-debt fees (2026-11-11)

1. **A completed disbursement later reversed by the operator** (withdrawal, loan or solidarity payout) is recorded with a `DISBURSEMENT_REFUNDED` entry that puts the money back exactly where the send took it from (member payable, solidarity fund, or loan receivable/general fund), once per disbursement. Any fee the operator keeps is absorbed by the general fund.
2. **Repaying a correction debt (CORRECTION obligation) by Mobile Money request:** the member bears the collection fee; the card shows the debt plus the fee, so the group is made whole to the franc (consistent with D16.1). Other debt payments (fines, installments, bids) keep R4.2: the general fund bears their fee share.

## D21. iPhone is a first-class target (2026-11-11)

The owner uses an iPhone. iOS, Android and web are all first-class targets from the same code (the spec's "Android first" no longer sets priority). Consequences:
- Day-to-day testing on the owner's iPhone with **Expo Go** (App Store), same Wi-Fi as the PC, QR code from `pnpm dev:mobile`. Android and the browser are tested too.
- Every screen respects iOS safe areas (notch, home indicator), iOS keyboard behaviour, swipe-back, and iOS permission prompts (Face ID, camera, photos, microphone), with French and English texts (`app.json` `ios.infoPlist` + `apps/mobile/locales/{fr,en}.json`).
- iOS cannot block screenshots (only screen recording): on iOS, PIN and money screens hide their content when the app goes to the background instead.
- Installing outside Expo Go (TestFlight/App Store) and iOS push notifications require an Apple Developer account and an EAS cloud build (no Mac needed); planned for Phase 9.

## D19. Governance limits (2026-11-09)

Confirms the platform engineer's design: proposals can be opened only after the group's first cycle has started (before that the admin sets up the group directly, R1.6); the admin cannot leave or be removed until an ADMIN_CHANGE has passed; a member can have one open proposal per type at a time (in addition to R11.6's one open RULE_CHANGE per parameter); an ADMIN_CHANGE can only elect an ACTIVE member (not one LEAVING).

## D20. Secret votes never close early; neutral solidarity pushes (2026-11-11)

1. **Secret proposals (MEMBER_REMOVE, ADMIN_CHANGE) always run their full window.** While open, members see only participation; the result and the yes/no totals are published together at `closesAt`. Non-secret proposals still close early when the result is certain (FSD GOV-02). Reason: an early close plus live participation reveals choices in small groups (R11.5, GOV-03, AC-07 take precedence over GOV-02 for secret votes).
2. **Push and lock-screen texts for solidarity requests are neutral** ("Nouvelle demande de soutien dans <groupe>"); the event type (deuil, maladie…) and the note are visible only inside the app.

## D23. 25 FCFA contributions and a custom round period (2026-11-17)

The owner asked for the smallest settings the operator allows, typed by the creator:

1. **`contributionAmount` minimum is 25 FCFA** (was 500; maximum unchanged at 1 000 000). Any whole amount from 25 up can be typed; the screen also offers shortcuts. The 100 FCFA withdrawal minimum (D11, R5.4) is unchanged, so a round pot under 100 FCFA cannot be withdrawn yet.
2. **New frequency `CUSTOM` with a new rule `customPeriodMinutes`** (whole minutes, 1 to 525 600, default 1 440; read only when the frequency is custom). Round k pays out at the first payout plus (k − 1) × `customPeriodMinutes`. The creator types a number and picks minutes, hours or days. It changes like any rule (RULE_CHANGE vote, next round, D13.1) and re-dates the remaining rounds.
3. **Deadline for a custom period:** `dueAt` is half a period before `payoutAt` when the period is under 48 hours (24 hours otherwise), so a deadline always falls after the previous payout and before its own. Across cycles, the lead before the first deadline is the shorter of 72 hours and one period (H3).
4. **A custom group may start within the hour:** its first payout only has to be in the future (the fixed frequencies still need a later day).
5. **Rule sets saved before this decision** have no `customPeriodMinutes`: it reads as the default 1 440 (`completeRuleSet`); nothing is rewritten.
6. The monthly payout day (Q1) and payout time of day do not apply to a custom period.

## D24. Model providers with failover, small contexts, and an app guide (2026-11-17)

The owner chose three free model providers and asked that when one is rate-limited or down the next takes over at once, that a second set of accounts back them up, and that the assistant explains the app well. Spec 4.2 and 4.11 name OpenRouter only; this extends them.

1. **Providers and order.** OpenRouter (`nvidia/nemotron-3.5-lightning:free`), then Groq (`qwen/qwen3.8-27b`), then Google AI Studio (`gemini-3.5-flash-lite`: Google is last because its models are often overloaded, and `gemini-3.8-flash` was refused with 503 in testing). Each is spoken to through its OpenAI-compatible endpoint, so one client class serves all three. Models come from `*_MODEL` variables, never from code. `LLM_PROVIDER_ORDER` reorders them.
2. **Batches of accounts.** Extra keys go in `OPENROUTER_API_KEYS`, `GROQ_API_KEYS`, `GOOGLE_AI_API_KEYS` (comma separated). The first key of every provider is batch 1, the second key of every provider batch 2, and so on. A later batch is asked only when every entry of the earlier ones has failed or is resting. Six models today: two batches of three.
3. **Failover rules.** A model call only produces text and tool calls; the runtime runs the tools. So moving a call to another provider can never replay money or a change. A failed entry rests (rate limit 60 s, outage and timeout 30 s, refused key 10 min) so the next messages skip it. Once any text has reached the member the call is never moved. Errors carry a code only; keys, requests and answers are never logged.
4. **Handover keeps the work.** The new provider receives the conversation and this turn's tool calls and results, plus a short note that another model began the reply and that results above are facts not to fetch again. Gemini 3 needs a "thought signature" on every replayed function call: its own is kept, and calls made by other models get Google's documented placeholder.
5. **Small context for small tiers.** A provider may have an input budget (`GROQ_MAX_INPUT_TOKENS`, default 3 500: Groq's free tier takes about 7 000 input tokens a minute; the full request is over 9 000). A larger request is cut to the system prompt, the current question, this turn's work (long results trimmed), the tools that fit (used ones, reading ones, then the categories the message is about) and as much recent history as still fits.
6. **New tool `get_app_guide` (private chat only), and a server-side prefetch.** How to use the app is not in spec 4.6, which has `explain_rule` for rules only. The guide (`apps/api/src/agent/knowledge/app-guide.ts`, French with "tu" and English) describes the five tabs and every flow with no amount, date or rule value in it. When a message is clearly a how, where or what-is question, the runtime adds the matching entry before the first call as if the model had called the tool, so a weak model cannot skip it or, worse, prepare a card for a question. The system prompt got a closing section "TEACHING THE APP" (the spec block above it is unchanged) and a rule never to name tools to the member.
7. **Not changed:** the model never confirms; tools act as the member; phone numbers in a typed message are replaced by markers before they reach any provider (see guards/number-slots.ts).

## Open questions (to confirm before the phase that needs them)

- **Q1 (resolved by D13.2):** monthly frequency. R2.2 says `payoutAt(k) = first + (k − 1) × frequency`, but the example payout time is "last Saturday of the month". Proposed default: monthly rounds keep the **same anchor** as the first payout (if the first payout is the last Saturday, every round is the last Saturday; if it is the 28th, every round is the 28th, clamped to the month's last day). Weekly and two-weekly add 7 or 14 days.
- **Q2 (resolved by D24):** OpenRouter model and API key. The owner puts the key in `apps/api/.env` themselves.

## D25. Unserved-member refund preserves beneficiary credits (2026-11-17)

When an unserved member leaves mid-cycle, contributions already paid and credited to beneficiaries remain credited to those beneficiaries. The leaver is refunded under R12.3: the general fund pays up to the amount available for loans, and the remaining members cover any shortfall through `SHORTFALL_SHARE` obligations. Do not claw back an existing beneficiary payable or create a beneficiary debt for this refund.

## D26. Secret votes close once everyone has voted (2026-11-18)

Refines D20.1. A secret proposal still never closes early on a certain result (live participation plus an early close would reveal choices in small groups), but once every eligible member has voted it closes at once and the result shows immediately. Otherwise it runs to `closesAt`. Non-secret proposals still close as soon as the result is certain (GOV-02).

## D27. Sessions last 30 idle minutes (2026-11-18)

Replaces the 30-day refresh token of spec 2.10. A refresh token lives 30 minutes from its last use; every rotation renews the window, and a token idle past it is refused. On web the refresh token stays only in the httpOnly cookie (D1) and the client keeps no copy. A dropped connection or a server error does not end the session: the app retries at launch and on the next request. Only a refusal by the server (expired, revoked, reused) signs the member out.

## D28. Developer console (2026-11-22)

The owner asked for an overseer role over the whole app, outside any group.

1. **Separate developer login.** Developers are not members. They sign in at a dedicated endpoint with their own credentials and a developer-only session (its own token audience, short life, no refresh through the member routes). Credentials come from environment configuration, never from code. Member tokens never open developer routes, and developer tokens never open member routes.
2. **Exception to rule 6, developer only.** The developer sees full phone numbers and complete account details of every user. This is the only audience that does. Members, the agent, its tools, prompts, logs and notifications are unchanged: numbers still never reach them. Developer responses use their own allowlist DTO.
3. **Actions: list users (with login history and groups), delete an account, close a group.** "Delete a group" means CLOSE + HIDE: the group disappears for members, takes no new activity and any open payments or votes are ended through the normal services; ledger rows are never deleted or edited (rule 3), so verify-ledger still passes. Deleting an account goes through the existing account-deletion service, not around it.
4. **Every developer action is written to the audit log** (who, what, target, time) and is confirmed by a second step in the UI. Money in flight blocks a deletion with a clear error instead of forcing it.

## D29. How the vote result and the chat send are made immediate (2026-11-23)

Implements D26 (a secret vote closes once every eligible member has voted; D20.1 otherwise stands) and the owner's two requests for speed.

1. **Rule.** `tallyProposal` takes `secret`: an open secret vote stays open while anyone is left who could vote, whatever the counts, until `closesAt`; it closes as soon as nobody is left (the result is then PASSED or REJECTED, since no vote can change it). `closeInstant` says when it counts as closed: a secret vote seen after its deadline closes as of `closesAt` (D20.1), every other close is that moment. The rule is pure and tested in `packages/rules`.
2. **No wait for a queue.** After a vote commits, the proposal is settled at once, as the system and outside the voter's transaction (`settleAfterVote`), for a public vote whose result is certain and for a secret vote that everyone has voted. The result, the system line in the chat, the notices and the `proposal.updated` event are therefore done before the voter's confirmation returns. Before this, a public vote waited for a queued job, which on Vercel runs at the next cron tick. If settling fails, a `votes.close` job retries. What a secret close reveals: that the last eligible member has voted (the time of the close), never any choice, and the ledger result names no member (R11.5).
3. **Chat send.** The send returns once the message is stored and announced. `@njangi` no longer runs the model inside that request: `onGroupMention` only queues a job (the safety net), and the author's app asks for the answer in a second request, `POST /v1/groups/:groupId/messages/:messageId/agent-reply`, which runs the turn in its own function invocation. It answers each message once (an existing agent reply or the member's turn lease stops a second run). Notifications are written after the commit, after the realtime event.
4. **Apps.** The phone puts a message on screen before the request leaves (an outbox that survives refetches), marks a failed one "Non envoyé" with a retry, polls the newest page every 2.5 s (1 s while the agent answers) even in the background or with the realtime link down, and polls open votes every 4 s. A screen listens to realtime as soon as the link exists, not only if it was up when the screen opened.

## D30. One agent conversation per group (2026-11-23)

The owner asked that the agent remember the exact work it does in each group, and that switching group switches its context. This extends spec 2.4 (AgentConversation) and 4.3.

1. **A private conversation belongs to one group for good.** There is one PRIVATE conversation per member and group (and one GROUP-channel conversation per member and group, as before). Each has its own lines, rolling summary, cards and result events. What is said in one group never reaches the model, the screen or the summary of another.
2. **Which thread.** `POST /v1/agent/messages` with a `groupId` talks in that group's thread (the member's access to the group is checked before a thread is created for it). Without a `groupId`, the thread used last receives the message. `GET /v1/agent/conversation?groupId=` reads one group's thread; without it, the one used last. `GET /v1/agent/history` takes the same optional filter.
3. **Result events and cards** go back to the thread that prepared the card; open cards no stored line names are shown only in their own group's thread.
4. **`switch_group`** no longer moves a conversation: it only reports the other group in the reply (`activeGroupId`), and the app moves to that group's own thread.
5. **Existing data.** The single conversation each member had stays attached to the group they used last; its older lines are not split. Nothing is rewritten.

## D31. Agent tools and checks added beyond spec 4.6 (2026-11-23)

The owner asked that the agent can do everything a member can do in the app, never claim an action that was not prepared, and never invent a screen.

1. **Six tools added** (same services as the routes, same PendingAction pattern for the changing ones): `cancel_meeting` and `close_meeting` (admin, L1), `list_meetings`, `list_invites` (admin; no phone number, no link), `mark_notifications_read`, and `set_notification_prefs` without arguments now reads the settings. Flows that need a screen stay on the screen (secret votes, PIN entry and reset, creating a group, joining by link, files and voice notes); the agent says exactly where.
2. **Claim guard.** After the model's final text, a private-channel turn is checked against what its tools really did: a text that claims a card or a finished action that no tool produced gets one correction step, then a sentence written by the server with the real reason of the refusal. A card that exists is always mentioned. The member is never told an action is done before its result event. This replaces the free-text trust of spec 4.2 step "final text"; when the steps run out after a failure the member hears the real reason instead of the generic sentence.
3. **App guide.** `get_app_guide` is an accurate map of the app, and a test checks every label and route it names against the real i18n strings and route files, so it cannot drift. The prompt says to direct the member only to screens the guide or a tool result names.

## D28, implementation note. How the developer console closes groups and deletes accounts (2026-11-23)

Added with the code, to be confirmed or changed by the owner. Nothing here changes what members, the agent or the logs see.

1. **A group is closed only when nobody holds money in it (conservative default, owner not yet asked).** The closing is refused with `GROUP_MEMBERS_HOLD_MONEY` while any member of the group has an obligation still due, a live loan (requested, approved, disbursed, overdue) or a non-zero payable or receivable balance. It is the same test the account deletion uses (`moneyHeldBy`, `modules/account/account.money.ts`). It runs after the group's open votes have expired, so a loan waiting on a vote is released first, and a refusal rolls everything back. To allow closing whatever members hold, set `REFUSE_WHEN_MEMBERS_HOLD_MONEY` to `false` in `modules/groups/groups.close.ts`. The owner decides what should happen to member money in a closed group (paying it out, keeping it for statements); until then no group is closed with money in it.
2. **Money in flight still blocks (rule 8):** payments and sends that are CREATED, PENDING or EXPIRED, and CONFIRMED PAY and WITHDRAW cards. Approved SOLIDARITY payouts that were never sent do not block: nothing was sent, and a closed group never sends them (the scans skip it). An approved LOAN does block, through point 1 (it counts as a live loan: the scan would normally send it, and it holds money-to-be).
3. **Account deletion keeps its checks for older closed groups.** A group closed by a developer after this note had no money held, but the blocker is not narrowed for closed groups: a group closed before the check existed could still hold some. Closing the group lifts only the admin and running-cycle refusals.
4. **Lock order.** A confirmation locks its card, then the group, then the member. A developer's closing and deletion follow it (the deletion waits for the user's cards first, the closing skips cards being confirmed and those confirmations are refused once the group is closed). A payment takes the group lock shared, a withdrawal exclusive (its ledger entry takes it exclusively anyway).
5. **A secret vote that ends because the group was closed records no totals in the hash chain.** `VOTE_CLOSED` then has no `yes` and `no` (zero would claim there were no ballots, the real totals would leak the vote). A normal close (`proposals.tally.ts`) does record the totals: the result and the totals are published to the members together at `closesAt` (D20.1). A developer's expiry publishes no result, so no totals are recorded.
6. **Open item.** A loan or withdrawal disbursement stuck at CREATED with no operator reference has no resubmission path; it blocks closing the group until it is settled. Not changed here (money logic).
