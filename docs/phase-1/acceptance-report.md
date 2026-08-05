# Phase 1 Completion and Acceptance Report

Date: 2026-07-16  
Scope status: Phase 1 implemented; no Phase 2 or later workflow implemented.  
Verification status: the historical credential-free and provider results below
are retained as evidence only. The current approved topology is Local/Test
processes using Development Neon (with disposable test schemas) and Vercel
Production using Production Neon. There is no active Preview or separate Test
resource.

## Inspection prerequisite

Before implementation, `txlocallist`, its existing `graphify-out` graph, and the referenced authentication/session source were inspected. Adopted and rejected patterns are recorded in `docs/architecture/txlocallist-inspection.md`. The source repository was not changed.

## Command evidence

| Check                            | Result       | Evidence                                                                                                                                                                                                                                                                               |
| -------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | PASS         | Exact lockfile accepted; Prisma Client 7.8.0 regenerated successfully.                                                                                                                                                                                                                 |
| `pnpm verify`                    | PASS         | Formatting, ESLint, dependency boundaries, strict TypeScript, Prisma validation, production dependency audit, 21 unit tests, 13 offline Blob contract tests, 12 integration tests, production build, and 2 Playwright tests all passed on the final lockfile.                          |
| Post-live `pnpm verify` rerun    | HISTORICAL   | This Phase 1-era result is superseded by the guarded Development-schema workflow documented under `docs/operations/development-neon-testing.md`.                                                                                                                                       |
| `pnpm audit:prod`                | PASS         | No known production dependency vulnerability at moderate-or-higher severity.                                                                                                                                                                                                           |
| `pnpm test:integration`          | PASS         | Fresh migration and repositories verified against PostgreSQL 16.14 with PostGIS 3.6.2 in a temporary localhost-only database.                                                                                                                                                          |
| `pnpm auth:benchmark`            | PASS (local) | Final Argon2id policy: 64 MiB, four iterations, one lane; p50 510.51 ms and p95 569.84 ms on Node 24.11.1 on this host.                                                                                                                                                                |
| `pnpm test:contract:blob`        | PASS         | 13 credential-free tests cover application types, opaque paths, test-double lifecycle, SDK isolation, and Vercel adapter/error mapping.                                                                                                                                                |
| `pnpm build`                     | PASS         | Next.js 16.2.10 production build compiled, type-checked, and generated all Phase 1 routes without warnings.                                                                                                                                                                            |
| `pnpm test:e2e`                  | PASS         | Chromium verified the foundation page, health route, request ID, no-store behavior, CSP, frame denial, and MIME-sniffing protection.                                                                                                                                                   |
| `pnpm verify:live`               | PASS         | Executed through `npx vercel env run -e preview` with `APP_ENV=preview`. Preview Neon had no pending migration, PostGIS 3.6.0 and rollback passed; protected Vercel Node 24.18.0 measured Argon2id p50 205.16 ms/p95 229.26 ms; the full Private Blob lifecycle passed and cleaned up. |

The original Phase 1 database-harness description is retired. Current
integration and browser suites use guarded, disposable schemas inside
Development Neon; no separate Test database, local PostgreSQL, or container
runtime is part of the project.

## Acceptance criteria

| Criterion                                                                                    | Status                                     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Greenfield local Git repository, pinned runtime/dependencies, lockfile, strict configuration | PASS                                       |
| Feature-module boundaries are executable and cycle-free                                      | PASS                                       |
| Real Prisma migration creates Phase 1 schema and enables PostGIS                             | PASS locally and on Preview Neon           |
| Transaction rollback and append-only durable audit behavior                                  | PASS                                       |
| Argon2id hash/verify/rehash policy and 64 MiB floor                                          | PASS locally and on Vercel Preview runtime |
| 32-byte opaque sessions persist hashes only; expiry fails                                    | PASS                                       |
| Session create/read/rotate/logout/revoke-one/revoke-all                                      | PASS                                       |
| Hashed, expiring, single-use verification/reset token primitives                             | PASS                                       |
| Host-only HTTP-only secure production cookie policy                                          | PASS                                       |
| Narrow `requireUser` and `requireAdmin` principals                                           | PASS                                       |
| Secrets/tokens redacted from logs and Sentry events                                          | PASS                                       |
| Durable job deduplication, locking, retry, dead-letter, and stale-lock recovery              | PASS                                       |
| Domain-neutral `MediaStore` contract with no event/photo tables or database coupling         | PASS                                       |
| Live Vercel Private Blob authorize/upload/inspect/read/sign/delete/absence lifecycle         | PASS                                       |
| Security headers, health route, baseline logging, and error tracking configuration           | PASS                                       |
| Credential-free GitHub Actions workflow and separate manual live workflow                    | PASS (configured; remote connected)        |
| Authentication, Blob, jobs, dependency, audit, and module architecture documented            | PASS                                       |
| Better Auth/alternate auth, second storage adapter, and Phase 2+ features absent             | PASS                                       |

## Retired historical Preview evidence

The facts in this section describe a completed historical run. They are not an
approved environment, deployment target, credential source, or prerequisite.
Do not recreate these resources. Current hosted verification uses the stable
Vercel Production beta and Production-scoped providers.

- The final deployment is the READY Preview deployment at `https://estate-sales-bakersfield-cmmeqnxtr-westcoselabs-projects.vercel.app`; `VERCEL_BENCHMARK_URL` is scoped to Preview and points to this immutable deployment.
- `APP_ENV=preview` and a valid `CRON_SECRET` were confirmed in the effective verification environment. All configured Vercel variables changed during this run were targeted to Preview only.
- Preview Deployment Protection remained enabled. The benchmark client now uses the authenticated Vercel CLI protection bypass when Vercel intercepts the direct request, while the application bearer secret stays in process environment data and is never placed in command-line arguments.
- An explicit `.vercelignore` prevents `.env*` and local verification artifacts from entering source deployments. The affected earlier Preview deployment was removed; the corrected builds contained no `.env` source file.
- No Vercel Production deployment or environment configuration, Production Neon resource, or Production Blob resource was accessed or modified.
- `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` remain outside `verify:live`; non-production event-ingestion verification is a later operational check.

## Documented implementation findings and deviations

1. TypeScript 7.0.2 did not type-check the selected Next.js declarations with library checking enabled, so TypeScript 5.9.3 is pinned. ESLint 10.7 conflicted with the selected Next.js ESLint peer range, so ESLint 9.39.5 is pinned. Exact versions remain repository configuration, not roadmap law.
2. The initial 64 MiB/two-iteration policy measured only 114.35 ms p50 on Vercel Preview. The centralized policy was raised to four iterations and revalidated at p50 205.16 ms/p95 229.26 ms; older parameter strings are marked for rehash.
3. The historical local integration override is retired; current database
   tests use guarded, disposable schemas inside Development Neon.
4. No GitHub owner, organization, repository name, or remote URL was invented. The user-supplied `origin` remote and linked Vercel project were used as configured.
5. Two moderate transitive advisories found during bootstrap were removed with narrow overrides to patched PostCSS and `@hono/node-server` releases; the final production audit reports no known vulnerabilities.
6. Vercel CLI does not override selector values already loaded from local dotenv files, and sensitive Preview variables are intentionally not downloadable. The live run therefore preseeded only the public `APP_ENV=preview` and immutable Preview URL selectors while using the distinct local non-production credentials.

## Scope hard stop confirmed

The repository contains no signup/login HTTP workflow, email delivery, rate-limit product integration, organizer profile, event/event-photo/upload-reservation model, image processing, stable public media route, Stripe/payment/publication logic, search, editorial route, admin product, or final UI. Implementation stops here at the Phase 1 foundation and acceptance report.
