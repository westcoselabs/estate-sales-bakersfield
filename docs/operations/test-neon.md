# Test Neon Operations

## Required isolated branch

Create one persistent Neon branch dedicated only to automated Test data. Do not reuse Preview or Production. Copy `.env.test.example` to ignored `.env.test.local` and set:

```text
APP_ENV=test
TEST_DATABASE_URL=<Test Neon pooled URL with sslmode=require>
TEST_DIRECT_URL=<same Test Neon database direct URL with sslmode=require>
TEST_NEON_ENDPOINT_ID=<exact ep-... endpoint id>
TEST_DATABASE_CONFIRMATION=estate-sales-bakersfield-isolated-test-neon
```

Confirm safety without printing URLs:

```text
pnpm db:test:check
```

Then run `pnpm test:integration` and `pnpm test:e2e`. Migrations are deployed normally before each suite. Each run receives a `testrun-...` ID. The PostgreSQL authentication limiter hashes that ID into an isolated scope, and teardown deletes only buckets matching that exact scope. Cleanup also deletes only durable queues and normalized emails bearing the run ID; user cascades remove owned sessions/tokens/organizers/events/media records. It first clears run-owned cover/current-approval references so the real consistency triggers remain satisfied during cascade. Because the append-only audit trigger prevents its `ON DELETE SET NULL` foreign-key action, Test teardown transactionally disables that one trigger, removes only audit rows tied to the collected run-owned user/organizer/event/session IDs, deletes the run users, and re-enables the trigger before commit. A failure rolls back the data changes and trigger state together.

## Explicit empty replay/reset

Broad reset is never part of normal tests. To deliberately verify empty-branch replay, confirm the endpoint again and set:

```text
TEST_DATABASE_RESET_CONFIRMATION=reset-estate-sales-bakersfield-isolated-test-neon
```

Then run `pnpm db:test:reset`. The command re-runs every guard, refuses every non-Test environment or known Preview/Production URL, uses only the Test direct URL, and sanitizes errors. Remove the reset marker afterward.

## Provider confinement

Automated commands strip real Blob, Resend, Mapbox, Sentry, all public build variables, all inherited Preview/Production-prefixed values, and all Vercel-scoped values. Playwright rebuilds the production application under that isolated Test environment, refuses to reuse an existing server, and uses Test Neon for real atomic rate limits, capture email, deterministic geocoding, and signed filesystem media inside `.tmp`. No real email or provider object is created.
