# Team guide: structure, ownership and conventions

Every agent reads this before writing code. It keeps the repository organised and stops two people writing in the same place. If something you need isn't covered, ask the lead.

## Who owns what

| Owner | Writes in |
|---|---|
| **Lead** | Root config, `scripts/`, `.github/`, `docs/DECISIONS.md`, `docs/TEAM.md`, `packages/shared/src/**` except the folders below, `apps/mobile/app/_layout.tsx`, `apps/mobile/src/{api,i18n,state,lib}/**`, `apps/mobile/src/features/**` (data hooks), mobile config files |
| **Designer** | `docs/design/**`, `packages/shared/src/i18n/ui.*.ts`, `apps/mobile/src/theme/**`, `apps/mobile/src/ui/**`, `apps/mobile/src/screens/**`, `apps/mobile/app/**` routes (except `_layout.tsx` at the root), `apps/mobile/assets/**` |
| **Money engineer** | `packages/rules/**`, `tools/verify-ledger/**`, `apps/api/src/modules/{ledger,providers,payments,withdrawals,payouts,cycles,rounds,obligations,loans,bids,fines,funds,reconciliation,statements}/**`, `apps/api/prisma/schema/{money,ledger}.prisma`, `packages/shared/src/contracts/{money,ledger,loans,bids,rounds,statements}.ts`, `packages/shared/src/i18n/server/{ledger,money}.ts` |
| **Platform engineer** | Everything else in `apps/api/**` (config, lib, http, permissions, dto, realtime, storage, jobs infrastructure, agent, and the modules auth, me, devices, groups, invites, members, rulesets, proposals, chat, media, notifications, meetings, solidarity, pending-actions, privacy), the other `apps/api/prisma/schema/*.prisma` files and all migrations, the other `packages/shared/src/contracts/*.ts` and `packages/shared/src/i18n/server/*.ts`, `tools/agent-eval/**` |

Never edit a file you don't own. If you need a change there, describe it in your report and the lead coordinates it. Only the lead runs `pnpm install` / `pnpm add` and only the lead commits.

## Repository layout

```
apps/
  api/
    prisma/
      schema/            one .prisma file per domain (base, identity, groups, money, ledger, governance, chat, meetings, notifications, agent, audit)
      migrations/        generated; never edit an applied migration
      seed/              demo data (spec 5.5)
    scripts/             setup-db.ps1 and other one-off scripts
    src/
      server.ts          entry: HTTP, Socket.IO, job workers
      app.ts             Express app factory (tests import this)
      config/            env.ts: every environment variable, validated with zod
      lib/               logger (pino with redaction), prisma, redis, errors, clock (the only place that reads the time), ids
      http/              middleware: request id, auth, validation, rate limits, CSRF, CORS, error handler
      permissions/       can(actor, action, resource) and its policies
      dto/               allowlist mappers per audience (toPublicMember, toSelf, toAdminView, ...)
      realtime/          Socket.IO server, room authorisation, typed emitters
      storage/           StorageProvider interface, local and s3 drivers
      jobs/              BullMQ queues, scheduler, worker registry (each module registers its processors)
      agent/             runtime, tool registry, prompts/system.md, output guard, history
      modules/
        <area>/
          <area>.service.ts    business logic; calls @njangi/rules for every calculation
          <area>.routes.ts     REST: validate input -> call service -> map with a DTO mapper
          <area>.tools.ts      agent tools: same shape as routes, never business logic
          <area>.actions.ts    PendingAction handlers (prepare and execute)
          <area>.jobs.ts       job processors
          <area>.repo.ts       Prisma queries, if the service needs more than a few
          <area>.test.ts       tests for this module (or a __tests__/ folder when there are several)
          index.ts             the module's public surface (what other modules may import)
    test/                shared test helpers: database reset, factories, auth helpers, phone-number scanner
  mobile/
    app/                 Expo Router routes only. Thin files that compose screens.
    src/
      theme/             tokens (light and dark), typography, spacing
      ui/                reusable components (NjangiRing, ConfirmationCard, AmountText, ...)
      screens/           one folder per screen; layout and presentation
      features/<area>/   data hooks (TanStack Query), mutations, realtime subscriptions
      api/               HTTP client, auth tokens, socket client
      i18n/              i18next setup
      state/             Zustand stores
      lib/               small helpers
    assets/              fonts, images, icons
packages/
  rules/src/<topic>/     pure rules by topic, each with its tests
  shared/src/
    contracts/<area>.ts  zod schemas and types for requests and responses, shared by API and app.
                         Imported as `@njangi/shared/contracts/<area>` (no barrel file to edit).
    i18n/                ui.fr.ts, ui.en.ts (designer); server/<area>.ts (bilingual server texts,
                         imported as `@njangi/shared/i18n/server/<area>`)
tools/
  verify-ledger/
  agent-eval/
docs/
```

## Conventions

- **Files:** kebab-case or `<area>.<role>.ts` as above. React components in PascalCase files (`ConfirmationCard.tsx`). One main thing per file. When a file passes about 300 lines, split it by concern.
- **Folders:** group by feature or domain, never by technical type across the whole app (no global `utils/` dumping ground).
- **Imports:** a module imports another module only through its `index.ts`. No circular imports. Workspace packages by name (`@njangi/rules`, `@njangi/shared`).
- **Names:** camelCase for values and functions, PascalCase for types and components, SCREAMING_SNAKE_CASE for stable error codes. Use the spec's vocabulary in code (`obligation`, `payable`, `beneficiary`, `round`, `cycle`).
- **Comments:** short, and cite the rule or section the code implements (`// R5.3`, `// spec 2.10`). No commented-out code, no TODOs left behind.
- **Errors:** API errors are `{ code, messageFr, messageEn }` with a stable `code`. Rules refusals are discriminated unions with a `code`.
- **Money:** integers only, formatted only with `formatXAF`. Times stored in UTC; the API reads the time only through `lib/clock`.
- **Tests:** next to the code, named after behaviour ("refuses a withdrawal during the number-change hold"). Rule tests are written before the rule code.
- **Text:** every user-facing string in French and English. French uses "tu".
- **Formatting:** Prettier settings in `.prettierrc.json`; ESLint must pass.
