# Development Neon Testing

## One Development database, isolated test schemas

Local development and automated tests use the same Development Neon database.
There is no separate Test or Preview database. Tests never use the shared
`public` schema: each integration or Playwright invocation creates a unique
`codex_test_<timestamp>_<random>` schema, deploys all committed migrations into it, and drops
only that generated schema afterward.

PostGIS is installed once in Development Neon's `public` schema. Prisma
Migrate deliberately restricts its migration search path to the selected test
schema, so the test runner copies migrations to a temporary directory and
qualifies the existing `geography` type as `public.geography` there. Committed
migration files and Production checksums are never modified; the temporary
copy and its migration history disappear with the test run.

Ignored `.env.local` must contain:

```text
APP_ENV=local
DATABASE_URL=<Development Neon pooled URL with sslmode=require>
DIRECT_URL=<same Development Neon database direct URL with sslmode=require>
DATABASE_RESOURCE_ENV=development
DEVELOPMENT_NEON_ENDPOINT_ID=<exact ep-... endpoint id>
DEVELOPMENT_DATABASE_CONFIRMATION=estate-sales-bakersfield-development-neon-test-schemas
```

The Development and Production endpoint IDs must differ. Never copy Production
database URLs or credentials into `.env.local`.

For an optional test-only override, copy `.env.test.example` to the ignored
`.env.test.local` and replace only the Development database identity values.
The test file is loaded after `.env.local`; it must still declare
`APP_ENV=test`, `DATABASE_RESOURCE_ENV=development`, the exact Development
endpoint ID, and the fixed confirmation phrase. It is not a third database or
deployment environment.

Confirm the guard without printing either URL:

```text
pnpm db:test:check
```

Then run `pnpm test:integration` and `pnpm test:e2e`. The
`scripts/with-test-schema.ts` wrapper generates the schema, migrates it, starts
the requested command, and drops it in a `finally` path after success, failure,
or forwarded interruption. Both schema-bound URLs are derived, but test child
processes receive the direct Development URL for both Prisma URL variables
because Neon Pooler rejects PostgreSQL startup options; normal local and
Production traffic remains pooled. The test application additionally strips inherited
Production-, Preview-, Vercel-, Blob-, Resend-, Geoapify-, Stripe-, and Sentry
credentials.

Prisma Migrate normally takes a database-wide advisory lock. The isolated test
runner disables that lock only for its temporary migration process because
each invocation owns a different schema and `_prisma_migrations` table. Normal
Development and Production migrations retain Prisma's advisory lock.

GitHub Actions uses the same wrapper with `DEVELOPMENT_DATABASE_URL`,
`DEVELOPMENT_DIRECT_URL`, `DEVELOPMENT_NEON_ENDPOINT_ID`, and the non-secret
Production endpoint identifier used only for collision rejection. There is no
Test or Preview database secret.

## Migration safety

`pnpm db:migrate:dev` is a guarded wrapper. It loads `.env.local` explicitly,
requires Local mode plus the Development marker, checks the exact Neon endpoint
and TLS posture, and rejects any identity matching the ignored Production
configuration. `prisma.config.ts` does not load `.env` implicitly.

Use:

```text
pnpm db:migrate:dev --name <lowercase-migration-name>
```

Never use `prisma db push`. The former broad Test-database reset command was
removed because disposable schemas make it unnecessary and because a reset is
unsafe against the shared Development database.

## Failure handling

If schema creation, migration replay, or a test command fails, teardown still
attempts to drop the exact validated generated schema. A schema that cannot be
cleaned automatically must be inspected and removed by its exact name; never
reset or drop the Development database or its `public` schema.
