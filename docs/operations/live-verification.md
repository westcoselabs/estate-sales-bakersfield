# Live Provider Verification

Live verification is intentionally excluded from normal pull-request CI. It must use isolated non-production resources and `APP_ENV=preview` or `APP_ENV=staging`; the runner blocks `APP_ENV=production`.

## Neon

Provide `DATABASE_URL` and `DIRECT_URL` for a disposable or dedicated isolated Neon branch. `pnpm verify:live` deploys real migrations, checks PostGIS, inserts a uniquely named transaction fixture, forces rollback, proves the row is absent, and performs best-effort cleanup. The operator is responsible for supplying a fresh/isolated branch because Phase 1 has no Neon management API credential or authority to create one.

## Vercel Argon2 runtime

Deploy the app to a non-production Vercel environment with a 32+ character `CRON_SECRET`, then set `VERCEL_BENCHMARK_URL` to that deployment. The protected benchmark endpoint is unavailable in `APP_ENV=production`. The live runner verifies hashing and comparison in the actual Node function runtime and enforces a resource envelope around the roadmap's 200–350 ms target.

## Vercel Private Blob

Provide `BLOB_READ_WRITE_TOKEN` for an isolated non-production private store. The test uses only generated `test/live-contract/...` keys and always attempts deletion in `finally`.

## Result semantics

Exit 0 means all configured live checks passed. Exit 1 means a check failed. Exit 2 means one or more required credentials/resources were unavailable and were explicitly reported as `BLOCKED`; it is not a passing result and does not alter a successful `pnpm verify` result.
