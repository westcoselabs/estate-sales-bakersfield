# Phase 1 Completion and Acceptance Report

Date: 2026-07-16  
Scope status: Phase 1 implemented; no Phase 2 or later workflow implemented.  
Verification status: credential-free suite `PASS`; external live-provider suite `BLOCKED` by unavailable non-production credentials/resources.

## Inspection prerequisite

Before implementation, `txlocallist`, its existing `graphify-out` graph, and the referenced authentication/session source were inspected. Adopted and rejected patterns are recorded in `docs/architecture/txlocallist-inspection.md`. The source repository was not changed.

## Command evidence

| Check                            | Result       | Evidence                                                                                                                                                                                                                                                      |
| -------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | PASS         | Exact lockfile accepted; Prisma Client 7.8.0 regenerated successfully.                                                                                                                                                                                        |
| `pnpm verify`                    | PASS         | Formatting, ESLint, dependency boundaries, strict TypeScript, Prisma validation, production dependency audit, 21 unit tests, 13 offline Blob contract tests, 12 integration tests, production build, and 2 Playwright tests all passed on the final lockfile. |
| `pnpm audit:prod`                | PASS         | No known production dependency vulnerability at moderate-or-higher severity.                                                                                                                                                                                  |
| `pnpm test:integration`          | PASS         | Fresh migration and repositories verified against PostgreSQL 16.14 with PostGIS 3.6.2 in a temporary localhost-only database.                                                                                                                                 |
| `pnpm auth:benchmark`            | PASS (local) | Argon2id hash-only calibration: 64 MiB, two iterations, one lane; p50 324.07 ms and p95 365.89 ms on Node 24.11.1 on this host.                                                                                                                               |
| `pnpm test:contract:blob`        | PASS         | 13 credential-free tests cover application types, opaque paths, test-double lifecycle, SDK isolation, and Vercel adapter/error mapping.                                                                                                                       |
| `pnpm build`                     | PASS         | Next.js 16.2.10 production build compiled, type-checked, and generated all Phase 1 routes without warnings.                                                                                                                                                   |
| `pnpm test:e2e`                  | PASS         | Chromium verified the foundation page, health route, request ID, no-store behavior, CSP, frame denial, and MIME-sniffing protection.                                                                                                                          |
| `pnpm verify:live`               | BLOCKED      | No isolated Neon URLs, Vercel preview benchmark URL/secret, or non-production Private Blob token were supplied. Every unavailable check reported `BLOCKED`; none was reported as passing.                                                                     |

The local machine has no Docker-compatible runtime. To complete credential-free database evidence without installing system software, the suite used its guarded `INTEGRATION_DATABASE_URL` fallback, which accepts only localhost and the exact database name `estate_sales_test`. The test database was created fresh, migrations were applied by the normal Prisma command, and the temporary PostgreSQL/PostGIS binaries and data were stopped and removed afterward. Pull-request CI still exercises the default Testcontainers path with `postgis/postgis:16-3.5-alpine`; no in-memory database replaces it.

## Acceptance criteria

| Criterion                                                                                    | Status                                              |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Greenfield local Git repository, pinned runtime/dependencies, lockfile, strict configuration | PASS                                                |
| Feature-module boundaries are executable and cycle-free                                      | PASS                                                |
| Real Prisma migration creates Phase 1 schema and enables PostGIS                             | PASS locally; live Neon BLOCKED                     |
| Transaction rollback and append-only durable audit behavior                                  | PASS                                                |
| Argon2id hash/verify/rehash policy and 64 MiB floor                                          | PASS locally; Vercel runtime BLOCKED                |
| 32-byte opaque sessions persist hashes only; expiry fails                                    | PASS                                                |
| Session create/read/rotate/logout/revoke-one/revoke-all                                      | PASS                                                |
| Hashed, expiring, single-use verification/reset token primitives                             | PASS                                                |
| Host-only HTTP-only secure production cookie policy                                          | PASS                                                |
| Narrow `requireUser` and `requireAdmin` principals                                           | PASS                                                |
| Secrets/tokens redacted from logs and Sentry events                                          | PASS                                                |
| Durable job deduplication, locking, retry, dead-letter, and stale-lock recovery              | PASS                                                |
| Domain-neutral `MediaStore` contract with no event/photo tables or database coupling         | PASS                                                |
| Live Vercel Private Blob authorize/upload/inspect/read/sign/delete/absence lifecycle         | BLOCKED                                             |
| Security headers, health route, baseline logging, and error tracking configuration           | PASS                                                |
| Credential-free GitHub Actions workflow and separate manual live workflow                    | PASS (configured; no remote supplied to execute it) |
| Authentication, Blob, jobs, dependency, audit, and module architecture documented            | PASS                                                |
| Better Auth/alternate auth, second storage adapter, and Phase 2+ features absent             | PASS                                                |

## Live-provider blocked items

- `DATABASE_URL` and `DIRECT_URL`: required for migration and transaction verification on an isolated non-production Neon branch.
- `VERCEL_BENCHMARK_URL` and `CRON_SECRET`: required to calibrate Argon2id inside the actual non-production Vercel Node runtime.
- `BLOB_READ_WRITE_TOKEN`: required for the full isolated Vercel Private Blob lifecycle.
- `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`: not required by `verify:live`; needed later to confirm event ingestion in a non-production project.

These blocks do not invalidate the passing credential-free suite, but the corresponding provider-dependent acceptance rows remain explicitly unpassed.

## Documented implementation findings and deviations

1. TypeScript 7.0.2 did not type-check the selected Next.js declarations with library checking enabled, so TypeScript 5.9.3 is pinned. ESLint 10.7 conflicted with the selected Next.js ESLint peer range, so ESLint 9.39.5 is pinned. Exact versions remain repository configuration, not roadmap law.
2. Local Argon2id calibration changed the baseline from three to two iterations at the fixed 64 MiB memory floor, bringing hash-only p50 into the roadmap's approximate target. Actual Vercel calibration remains blocked.
3. A localhost-only integration database override was added solely for hosts without a container runtime. Testcontainers remains the default and CI path.
4. No GitHub owner, organization, repository name, or remote URL was invented. The local `main` repository, workflows, and documentation are remote-ready.
5. Two moderate transitive advisories found during bootstrap were removed with narrow overrides to patched PostCSS and `@hono/node-server` releases; the final production audit reports no known vulnerabilities.

## Scope hard stop confirmed

The repository contains no signup/login HTTP workflow, email delivery, rate-limit product integration, organizer profile, event/event-photo/upload-reservation model, image processing, stable public media route, Stripe/payment/publication logic, search, editorial route, admin product, or final UI. Implementation stops here at the Phase 1 foundation and acceptance report.
