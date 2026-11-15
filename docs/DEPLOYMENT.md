# NjangiTrust deployment preparation

For the evolving serverless conversion, implementation decisions, file map,
known risks, and verification handoff live in
[`VERCEL_SUPABASE_HANDOFF.md`](./VERCEL_SUPABASE_HANDOFF.md).

The target is two Vercel projects plus a Supabase PostgreSQL project:

1. **Frontend**: Vercel project root `apps/mobile`, framework preset `Other`.
   The project uses `apps/mobile/vercel.json`, runs `pnpm web:export`, and serves
   the generated `dist` directory.
2. **Backend**: Vercel project root `apps/api`, framework preset `Other`.
   The project uses `apps/api/vercel.json` and exposes the Express app through
   `apps/api/api/index.ts`; `/api/cron` is a separate scheduled function.

## Required Vercel settings

Create the projects from the same repository, set the matching root directory,
and use Node.js 22. Add the variables from `apps/api/.env.example` to the
backend project and `EXPO_PUBLIC_API_URL` from `apps/mobile/.env.example` to the
frontend project. Production values belong in Vercel's environment settings,
not in `.env` files committed to Git.

Before the first production deployment, run Prisma migrations from a controlled
one-off environment using the migration-owner connection:

```text
pnpm --filter @njangi/api db:migrate
```

Use `MIGRATION_DATABASE_URL`/`PRISMA_MIGRATE_URL` for that step. Do not run
`db:reset`, `prisma migrate dev`, or the development seed against production.
Migrations are additive and do not delete application data, but they still need
to be reviewed before execution.

Create a private Supabase Storage bucket named by `SUPABASE_STORAGE_BUCKET`.
In Supabase Realtime settings disable public channel access, then apply the
Realtime policy migration in this repository. Set `SUPABASE_JWT_SECRET` and
`SUPABASE_SERVICE_ROLE_KEY` only in the backend Vercel project. The frontend
receives only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## Important Vercel limitations

The target architecture replaces the long-running Socket.IO process with
Supabase Realtime, BullMQ/Redis jobs with PostgreSQL-backed jobs processed by
Vercel Cron, and local uploads with Supabase Storage. These conversions are in
progress; see `VERCEL_SUPABASE_HANDOFF.md` for the implemented portions and
remaining work. Do not treat the current deployment configuration as production
ready until that handoff's remaining items are complete.

Vercel Hobby Cron only has daily execution with hourly precision, so it cannot
process this application's time-sensitive work. The project uses Supabase Cron
(`pg_cron` + `pg_net`) to call the protected Vercel `/api/cron` endpoint every
minute instead. Complete [SUPABASE_CRON_SETUP.sql](./SUPABASE_CRON_SETUP.sql)
in the Supabase SQL Editor after you know the API URL and Cron secret. Supabase
supports recurring HTTP calls through these extensions. [Supabase Cron](https://supabase.com/docs/guides/cron) [Supabase pg_net](https://supabase.com/docs/guides/database/extensions/pg_net)

File uploads must use `STORAGE_DRIVER=supabase` and a private Supabase bucket;
local `.storage` is not durable on Vercel. Supabase PostgreSQL must use a pooled
connection for function traffic and a direct connection for migrations.

## Supabase database setup

Supabase is compatible with the current backend because it provides managed
PostgreSQL. The existing Prisma schema, migrations, financial ledger, audit
records, and database protections can remain in place. Supabase's documented
connection guidance recommends a pooled connection for serverless traffic and
a direct connection for migrations and backup/restore operations.

Set `DATABASE_URL` to the Supabase pooled connection from
`apps/api/.env.example` (with the real project reference, region, and password).
Set `MIGRATION_DATABASE_URL` or `PRISMA_MIGRATE_URL` to the direct connection
for migration commands. Keep these separate: the application role should not
be used as the migration owner.

Safe first-time setup:

1. create a new Supabase project and keep the current local PostgreSQL database
   unchanged;
2. create the required roles/permissions in Supabase and configure the two
   connection strings;
3. take a verified backup/export of the source database;
4. apply the reviewed Prisma migrations to Supabase;
5. import only the approved data and verify row counts, balances, hash chains,
   and audit history before changing production traffic.

No existing data is moved, deleted, or overwritten by this preparation.

## Pre-deployment checks

```text
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @njangi/mobile web:export
pnpm --filter @njangi/api db:generate
```

The deployment credentials should be supplied only through the relevant
provider dashboards or secure secret input. Never paste private keys into the
repository or chat.
