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

Playwright starts the production build with `APP_ENV=test`, a capture email adapter, deterministic rate limiter, filesystem media confined to `.tmp`, deterministic Bakersfield location fixtures, and unique run-owned users. Test-only seams hard-fail outside `APP_ENV=test`. No provider email is sent.

## Migrations

Phase 2 adds `20260717000000_phase2_auth_and_organizers`. Apply migrations with `pnpm db:migrate:deploy`; never use `prisma db push`. The Test Neon runner applies committed migrations in order. A clean destructive replay requires the explicit reset confirmation documented in [Test Neon operations](../operations/test-neon.md).

## Provider configuration

Upstash and Resend credential pairs are selected only for deployed environments. Preview credentials require matching `UPSTASH_RESOURCE_ENV=preview` and `RESEND_RESOURCE_ENV=preview` markers. Local/test email remains capture-only. Preview email links require the validated active Vercel Preview host. Production credentials must never be loaded into Preview or Test verification.
