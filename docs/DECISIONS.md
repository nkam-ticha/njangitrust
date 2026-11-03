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

## Open questions (to confirm before the phase that needs them)

- **Q1 (Phase 1):** monthly frequency. R2.2 says `payoutAt(k) = first + (k − 1) × frequency`, but the example payout time is "last Saturday of the month". Proposed default: monthly rounds keep the **same anchor** as the first payout (if the first payout is the last Saturday, every round is the last Saturday; if it is the 28th, every round is the 28th, clamped to the month's last day). Weekly and two-weekly add 7 or 14 days.
- **Q2 (Phase 4):** OpenRouter model and API key. The owner puts the key in `apps/api/.env` themselves.
