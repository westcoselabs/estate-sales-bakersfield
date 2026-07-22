# Phase 2 Testing and Migration

## Commands

```text
pnpm format:check
pnpm lint
pnpm arch:check
pnpm typecheck
pnpm prisma:validate
pnpm audit:prod
pnpm test:unit
pnpm test:contract:email
pnpm test:contract:blob
pnpm test:integration
pnpm build
pnpm test:e2e
pnpm verify
```

Unit and provider-contract tests require no external credentials. Integration and Playwright tests use only the persistent isolated Test Neon branch. They require the guards in `.env.test.local`; absent Test credentials are `BLOCKED`, not `PASS`.

Playwright starts the production build with `APP_ENV=test`, a capture email adapter, real PostgreSQL rate limits isolated by a hashed `TEST_RUN_ID` scope, filesystem media confined to `.tmp`, deterministic Bakersfield location fixtures, and unique run-owned users. Test-only seams hard-fail outside `APP_ENV=test`. No provider email is sent.

## Migrations

Phase 2 adds `20260717000000_phase2_auth_and_organizers`. The later architecture simplification adds the forward-only `20260722000000_postgresql_auth_rate_limits` migration without changing the applied Phase 1-3 files. Apply migrations with `pnpm db:migrate:deploy`; never use `prisma db push`. The Test Neon runner applies committed migrations in order. A clean destructive replay requires the explicit reset confirmation documented in [Test Neon operations](../operations/test-neon.md).

## Provider configuration

Authentication rate limiting uses the configured Neon database in every application environment and requires no separate provider account or credentials. Preview email uses Resend credentials with `RESEND_RESOURCE_ENV=preview`; local/test email remains capture-only. Preview email links require the validated active Vercel Preview host. Production credentials must never be loaded into Preview or Test verification.
