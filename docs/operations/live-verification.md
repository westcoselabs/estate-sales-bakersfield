# Live Provider Verification

Live verification is intentionally excluded from normal pull-request CI. It must use isolated Preview resources and `APP_ENV=preview`; the runner refuses local, test, and Production.

## Neon

Provide `DATABASE_URL` and `DIRECT_URL` for the isolated Preview Neon branch and set `DATABASE_RESOURCE_ENV=preview`. `pnpm verify:live` deploys real migrations, checks PostGIS, inserts a uniquely named transaction fixture, forces rollback, proves the row is absent, and performs best-effort cleanup. The operator is responsible for confirming the branch identity because the repository has no Neon management authority and the scope marker is not cryptographic proof of a vendor resource.

## Vercel Argon2 runtime

Deploy the app to a non-production Vercel environment with a 32+ character `CRON_SECRET`, then set `VERCEL_BENCHMARK_URL` to that deployment. The protected benchmark endpoint is unavailable in `APP_ENV=production`. The live runner verifies hashing and comparison in the actual Node function runtime and enforces a resource envelope around the roadmap's 200–350 ms target. If Vercel Deployment Protection intercepts the request, the benchmark client uses the authenticated local Vercel CLI to obtain a Preview protection bypass while curl imports the application bearer secret from the child process environment rather than command-line arguments.

## Vercel Private Blob

Provide `BLOB_READ_WRITE_TOKEN` for an isolated Preview private store and set `BLOB_RESOURCE_ENV=preview`. The test uses only generated `test/live-contract/...` keys and always attempts deletion in `finally`.

## Phase 2 authentication providers

Preview authentication requires Preview Neon with the PostgreSQL rate-limit migration, a Preview-only `AUTH_FINGERPRINT_SECRET`, and a Preview Resend key/sender. Confirm variable names and environment scope without printing values. Exercise email only through a provider test mode or an explicitly approved controlled recipient. Verify rate-limit thresholds, expiry, concurrency, and the sanitized fail-closed response without substituting Production credentials or a process-memory authority. If Resend or the controlled delivery target is unavailable, only delivery-dependent checks are `BLOCKED`.

The authenticated `/api/internal/jobs/run` endpoint deletes expired authentication buckets from the current environment's Neon database before processing durable jobs. Run it at least hourly in deployed environments and retain sanitized evidence of `rateLimitBucketsDeleted`; a missing maintenance schedule is an acceptance blocker for bounded retention.

## Result semantics

Exit 0 means all configured live checks passed. Exit 1 means a check failed. Exit 2 means one or more required credentials/resources were unavailable and were explicitly reported as `BLOCKED`; it is not a passing result and does not alter a successful `pnpm verify` result.

When the workspace contains local dotenv files, Vercel CLI preserves already-defined selector values instead of replacing them with downloaded Preview values. Preflight the effective child environment and explicitly set only the public `APP_ENV=preview` and `VERCEL_BENCHMARK_URL` selectors when necessary. Sensitive Preview values are intentionally unavailable to a clean `vercel env run`; provide the matching isolated non-production credentials through the operator's untracked local environment or a protected CI environment.
