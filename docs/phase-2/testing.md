# Phase 2 Testing and Migration

## Local commands

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

Unit and contract tests require no provider credentials. Integration and Playwright tests start disposable `postgis/postgis:16-3.5-alpine` databases and therefore require a Docker-compatible runtime. If that prerequisite is absent, the result is `BLOCKED`, not `PASS`.

Playwright runs the production build with `APP_ENV=test`, a test-only rate limiter, and a file capture email adapter under `.tmp/`. The captured links are available only to the test runner; no test endpoint exposes tokens.

## Migration

Phase 2 adds `20260717000000_phase2_auth_and_organizers`. Apply migrations with:

```text
pnpm db:migrate:deploy
```

Never use `prisma db push`. Migration replay is exercised by the disposable integration database. Preview migrations must use only the isolated Preview Neon connection and the existing production hard-fail guards.

## Environment placeholders

```text
AUTH_FINGERPRINT_SECRET=<environment-specific 32+ character secret>
UPSTASH_REDIS_REST_URL=<isolated environment REST URL>
UPSTASH_REDIS_REST_TOKEN=<isolated environment token>
RESEND_API_KEY=<environment-specific API key>
RESEND_FROM=<verified sender identity>
AUTH_EMAIL_CAPTURE_PATH=<local/test only, inside .tmp; unset when deployed>
```

`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` and `RESEND_API_KEY`/`RESEND_FROM` must be configured as pairs. Local/test authentication uses only the file capture adapter; Resend is selected only in Preview, staging, or Production. Preview email links require the validated active Vercel Preview host and fail closed without it. Production credentials must never be loaded for Preview verification.

## Preview checks

Before any live command, confirm `APP_ENV=preview` without printing secret values. Use only Preview Neon, Upstash, Resend, Blob, and Vercel resources. A live email test requires an explicitly approved recipient or provider test mode. Missing Preview provider credentials are recorded as `BLOCKED`; credential-free results remain valid.
