# Development Neon Testing

## One Development database, isolated test schemas

Local development and automated tests use the same Development Neon database.
There is no separate Test or Preview database. Tests never authenticate as the
Development database owner and never read or mutate application data in the
shared `public` schema. Each integration or Playwright invocation uses the Development-only lifecycle
credential to create a unique `codex_test_<timestamp>_<random>` schema and a
matching `codex_test_role_<timestamp>_<random>` login. The generated login owns
only that schema. Migrations and tests run as the generated login; teardown
drops the schema and login.

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
PRODUCTION_NEON_ENDPOINT_ID=<exact Production ep-... endpoint id; not a secret>
DEVELOPMENT_DATABASE_CONFIRMATION=estate-sales-bakersfield-development-neon-test-schemas
```

The Development and Production endpoint IDs must both be present and must
differ. The Production endpoint ID is an authoritative, non-secret collision
guard and remains required even when the ignored Production `.env` is absent.
Never copy Production database URLs or credentials into `.env.local`.

The configured Development URLs are lifecycle credentials. The wrapper never
passes them to the migration or test child. The lifecycle principal must be a
Development-only database owner with `CREATEROLE`; PostGIS must already be
installed in `public`. The currently configured Neon Development owner meets
these requirements, so no new secret is required. If a different Development
principal is introduced, provision it once in the Development project and put
only its pooled/direct URLs in `.env.test.local`. `pnpm db:test:check` fails with
the required remediation when ownership, `CREATEROLE`, PostGIS, or the
Production endpoint identity is missing.

For an optional test-only override, copy `.env.test.example` to the ignored
`.env.test.local` and replace only the Development database identity values.
The test file is loaded after `.env.local`; it must still declare
`APP_ENV=test`, `DATABASE_RESOURCE_ENV=development`, the exact Development
endpoint ID, and the fixed confirmation phrase. It is not a third database or
deployment environment. Replace its Production endpoint placeholder with the
authoritative Production
endpoint ID; it must not contain a Production URL.

Confirm the guard without printing either URL:

```text
pnpm db:test:check
```

Then run `pnpm test:integration` and `pnpm test:e2e`. The
`scripts/with-test-schema.ts` wrapper generates the schema and a 256-bit random,
eight-hour runtime credential, migrates it, verifies least privilege, starts the
requested command, and drops both schema and login in a `finally` path after
success, failure, or forwarded interruption. The runtime is `NOSUPERUSER`,
`NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, and `NOBYPASSRLS`. Before tests start,
the wrapper verifies that it cannot create an arbitrary schema, cannot create
in `public`, cannot read or write application tables in `public`, and cannot
perform a qualified no-op update against `public.events`. It also performs
actual rollback-safe negative probes for arbitrary `CREATE SCHEMA` and the
qualified public update.

The runtime search path ends with `public` only so existing unqualified PostGIS
functions and types remain available. The generated role has `USAGE`, not
`CREATE` or application-table DML, there; the privilege checks above enforce
that distinction before any test command runs.

Test child processes receive the generated direct runtime URL for both Prisma
URL variables because Neon Pooler rejects PostgreSQL startup options. They do
not receive either lifecycle URL. Normal local and Production traffic remains
pooled. The test application additionally strips inherited Production URLs,
Preview-, Vercel-, Blob-, Resend-, Geoapify-, Stripe-, and Sentry credentials;
the non-secret Production endpoint ID remains available to the fail-closed
runtime guard.

Prisma Migrate normally takes a database-wide advisory lock. The isolated test
runner disables that lock only for its temporary migration process because
each invocation owns a different schema and `_prisma_migrations` table. Normal
Development and Production migrations retain Prisma's advisory lock.

GitHub Actions uses the same wrapper with the Development-only lifecycle
secrets `DEVELOPMENT_DATABASE_URL` and `DEVELOPMENT_DIRECT_URL`, plus
`DEVELOPMENT_NEON_ENDPOINT_ID` and the non-secret Production endpoint identifier
used only for collision rejection. The ephemeral runtime credential is created
inside Development Neon and is never stored as a repository or GitHub secret.
There is no Test or Preview database secret.

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

If role/schema creation, migration replay, privilege verification, or a test
command fails, teardown still attempts to drop the exact validated generated
schema and matching role. Cleanup terminates only sessions authenticated as
that generated role; the detached watchdog retries cleanup after abrupt parent
termination. A schema that cannot be cleaned automatically must be inspected
and removed by its exact name; never reset or drop the Development database or
its `public` schema.
