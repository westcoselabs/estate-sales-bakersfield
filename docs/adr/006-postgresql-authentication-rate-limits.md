# ADR 006: PostgreSQL Authentication Rate Limits

Status: accepted; amended on 2026-07-21 by the architecture simplification decision.

## Decision

Use the environment-specific Neon PostgreSQL database as the distributed authority for authentication rate limits in local, test, Preview, and Production. Keep the provider-neutral `RateLimiter` application port so a future Redis adapter would not change authentication workflows.

The Prisma infrastructure adapter applies a fixed window with one atomic `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` statement. Its primary key separates the application environment, a SHA-256 scope hash, the workflow and network/subject namespace, and a SHA-256 identifier hash. The identifier received from `AuthenticationAbuseControl` is already an HMAC-SHA-256 privacy fingerprint; the adapter hashes it again with its environment, scope, and namespace before persistence. Raw email addresses, IP addresses, verification/reset tokens, and passwords never enter the table.

Limits apply independently to network and subject fingerprints:

| Workflow            |     Network limit |     Subject limit |
| ------------------- | ----------------: | ----------------: |
| Registration        |  5 per 15 minutes |        3 per hour |
| Login               | 20 per 15 minutes | 10 per 15 minutes |
| Verification resend |       10 per hour |        3 per hour |
| Forgot password     |       10 per hour |        3 per hour |
| Password reset      | 10 per 15 minutes |  5 per 15 minutes |

Every protected workflow fails closed when the rate-limit database operation fails. Registration, login, and reset receive a sanitized 503. Verification-resend and forgot-password threshold rejections retain their generic 202 response, while a database outage returns the same sanitized 503 for every submitted identity. No workflow falls back to process memory.

The authenticated cron/job runner deletes expired buckets from its environment-specific Neon database whenever it runs. It must run at least hourly in deployed environments; local operators can run `pnpm jobs:run`. Test runs use a hashed `TEST_RUN_ID` scope and delete only their own buckets during teardown.

## Rationale

Authentication already depends on Neon for account, token, and session state. Reusing that durable authority removes a provider, credential family, and failure mode while preserving cross-instance enforcement on Vercel. A fixed-window upsert is small, inspectable, and protected from duplicate-consumption races by PostgreSQL's unique primary key and row-level conflict handling.

## Consequences

Rate limiting now shares database availability and capacity with authentication persistence. The deliberate failure mode is fail-closed, so a Neon outage makes protected authentication operations temporarily unavailable. Fixed windows can permit boundary bursts. Expired records require the existing authenticated maintenance runner, and its execution is an operational acceptance check. Database load and bucket cardinality should be monitored before changing policies or introducing another adapter.
