# Launch hardening status — 2026-09-15

**Application hardening is implemented and verified locally; operational launch gates remain.** This report covers the authorized hardening work in steps 1–5. No changes have been deployed, and no production configuration or provider resources have been changed. Real Stripe remains intentionally deferred until the application is complete.

Verification below covers the local working tree. No deployment or Production migration was performed.

## Implemented

| Area                            | Result                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dependencies and release checks | Updated vulnerable dependencies; verified the existing production dependency audit and coverage gates. The read-only release checker distinguishes application preparation from public launch and reports configuration evidence separately from operational evidence.                                                                                                               |
| Administrator security          | Added authenticator enrollment/challenges, one-use recovery codes, credential generations, session rotation, fresh proof for sensitive actions and an audited operator recovery command. Production key configuration and owner enrollment remain outstanding.                                                                                                                       |
| Database and search             | Added typed search fields derived from immutable publications, ordered and viewport indexes, early per-source filtering/25-row limits, a runnable-job index, and shared cache generations updated transactionally with visibility changes. Search caching preserves date/privacy boundaries; metadata and detail rendering share a request-scoped lookup.                            |
| Resource protection and workers | Added account draft/photo/source-byte budgets, PostgreSQL limits for expensive operations, bounded photo processing and sequential image renditions. Processing renews a ten-minute lease and postpones cleanup atomically. Workers admit at most 50 jobs, concurrency two, with a 20-second admission budget. Readiness now surfaces overdue work and paid-but-blocked fulfillment. |
| Frontend, SEO and public detail | Reduced map/card/marquee work and removed avoidable date-filter computation. Added current-day/weekend landing pages, sitemap generation, canonical/structured-data improvements, and public detail handling for approved imports. General indexing and imported-listing indexing have separate launch gates. `/contact` can display an owner-supplied support inbox.                |

Local configuration now has its own MFA encryption key. The local Geoapify key that matched Production was removed to satisfy the existing environment-isolation guard; configure a separate Development Geoapify key for real local address lookup. Browser tests use isolated location fixtures. The new database migrations have only been applied to disposable test schemas; persistent Development and Production still need the reviewed migration process.

The daily Hobby cron schedules remain unchanged. Higher worker limits alone do not supply prompt delivery or establish high-volume capacity. See [resource limits and workers](resource-limits-and-workers.md).

## Verification snapshot

| Check                                                  | Latest confirmed result                                                                                                                        |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests and five mocked provider contract projects  | **PASS: 110 files, 535 tests**; configured 35% coverage thresholds passed (43.13% statements, 39.89% branches, 41.44% functions, 44.20% lines) |
| Isolated Development database integration tests        | **PASS: 134 full-suite tests plus ten new regression cases (144 unique tests)**                                                                |
| Production dependency audit                            | **PASS: zero reported advisories**                                                                                                             |
| Prisma schema validation                               | **PASS**                                                                                                                                       |
| Architecture boundaries                                | **PASS: 586 modules, 1,483 dependencies**                                                                                                      |
| Production build                                       | **PASS**, including the current E2E rebuild and Linux Sharp runtime trace                                                                      |
| Browser E2E                                            | **PASS: 47 unique browser scenarios across the 46-test successful portion of the full run and the corrected import-journey rerun**             |
| Concurrent password reset/session rotation             | **PASS: shared user locking and six deterministic concurrency regressions**                                                                    |
| Hosted runtime, live payments and operational recovery | **NOT VERIFIED** by these local checks                                                                                                         |

TypeScript, full ESLint, formatting, historical migration checksums and Git whitespace checks passed. The local preparation configuration check passed with public indexing and live payments disabled; operational evidence remains unverified. Masked administrator enrollment/recovery screens were inspected at desktop and mobile sizes.

The browser runs caught a real duplicate photo-cleanup-job failure, which was fixed in the UI and repository and covered by a database regression. Other failures came from expired calendar fixtures, the expected MFA redirect and overlapping fixture sales after location confirmation. The import journey passed after its dates were separated from the other fixture. All disposable database schemas were removed.

### Measured search improvement

The baseline and revised full benchmarks each seeded **100,000 stored users and 10,000 listings** and ran **1,800 measured searches** at concurrency 1, 10 and 25, with zero failures. Both used the same synthetic fixture and Node runtime in disposable Development schemas.

- First-page PostgreSQL execution: **27.329 → 1.884 ms**; the final merge receives 50 rows instead of 7,063.
- Broad-map PostgreSQL execution: **32.449 → 2.108 ms**.
- First-page throughput at concurrency 25: **39.673 → 126.966 queries/second**.
- Tight-map server work remained near 1 ms; its client throughput was lower in the revised run.

These are warm database measurements, not 100K concurrent users or a production HTTP capacity guarantee. Network/pool latency, cold starts, real traffic, media and deployed hardware remain unmeasured. See the [paired benchmark report](../../artifacts/performance/public-search-comparison-2026-09-15.md) and its raw JSON evidence.

Latest verification used `pnpm exec vitest run --project unit --project blob-contract --project email-contract --project location-contract --project image-contract --project stripe-contract --coverage --reporter=dot --maxWorkers=4`. A preceding heavily parallel run timed out in a filesystem-scanning contract; the complete bounded run passed. Database counts combine the full suite with affected tests rerun after fixes. Test-schema cleanup was confirmed.

The operator recovery CLI additionally passed three isolated database tests: incorrect confirmation/environment and ordinary-account targets are rejected without mutation; successful recovery removes only the target administrator’s MFA and sessions, preserves the account password/role and other users’ sessions, records the audit event, and requires reenrollment. The recovery command was not run against an application database.

### Populated migration rehearsal

The [isolated rehearsal report](../../artifacts/performance/launch-migrations-testrun-mu22gwjo-75d1725c.json) passed with 100,000 accounts and 10,000 existing listings. All 5,000 search records matched their immutable publications, publication snapshots were unchanged, all indexes were valid, both MFA foreign keys had the intended cascades, and an existing administrator session gained no MFA proof. The search migration took 313 ms and the MFA migration 206 ms wall time in this fixture. The wrapper confirmed cleanup.

The rehearsal restores the predecessor structure while the isolated schema is empty, seeds data with existing invariants enabled, and replays checked-in SQL transactionally. It does not measure the Production migration window or exercise Prisma deployment orchestration. See [reproduction instructions](../../tests/performance/README.md#populated-migration-rehearsal).

## Migration and deployment prerequisites

The new migrations are:

1. [20260915010000_public_search_projection](../../prisma/migrations/20260915010000_public_search_projection/migration.sql): search projection/backfill, indexes, visibility revision and triggers.
2. [20260915020000_admin_mfa](../../prisma/migrations/20260915020000_admin_mfa/migration.sql): MFA credentials/recovery codes and session proof columns.

Before an independently approved promotion:

- Review migration status and drift, take a recoverable target-database backup, and apply the reviewed additive migrations **before** the application version that queries the new tables/columns. Do not use `db push`, reset or a replacement seed.
- Verify PostGIS geometry and operators are available in the `public` schema expected by the viewport indexes. Preflight existing publication snapshots for the required event type, schedule, privacy and city/region fields used by the backfill.
- The synthetic populated-data rehearsal passed. Before Production, verify the actual target snapshot distribution and recovery backup, and plan for write blocking from ordinary `CREATE INDEX`. The rehearsal had no competing writers and does **not** establish Production lock impact or migration duration.
- After migration, check projection/publication row parity, the singleton visibility revision, trigger/index validity and scoped statistics. Verify search, privacy release, removal invalidation and administrator access on the accepted build.
- Owner deferred mandatory administrator MFA. Password-only administrator access is supported until optional enrollment; enrolled accounts still require MFA. Configure and back up `ADMIN_MFA_ENCRYPTION_KEY` only when enrolling, and retain it for any already-enrolled account. See [MFA operations](administrator-mfa.md).
- Preserve `PUBLIC_INDEXING_ENABLED=false`, `PUBLIC_IMPORTED_INDEXING_ENABLED=false`, disabled campaigns and the existing Stripe test/beta posture. `pdx1` is configured locally; confirm actual compute/database proximity after deployment.

The older [Production beta runbook](production-beta.md) supplies the promotion sequence; this section adds the new projection/MFA prerequisites. No production migration or promotion was performed for this report.

## Outstanding decisions and launch evidence

- Owner selected daily Vercel schedules until upgrading to Pro. Verify queue capacity and accept the resulting queued-email/recovery delay for the current beta; re-evaluate scheduling before paid launch.
- Administrator MFA is optional under the owner-approved launch policy. Provider-account security remains a separate check.
- Owner supplied `decoratedbyriley@gmail.com` as the public support inbox and approved organizer cancellation with non-refundable listing fees. Local configuration, terms/FAQ, approval/payment disclosure and cancellation confirmation now reflect that policy. Set `PUBLIC_SUPPORT_EMAIL` in Vercel Production and verify mailbox delivery before launch. Final terms and privacy wording still require approval.
- Record backup/restore results, actionable readiness alerts, incident ownership and recovery procedures.
- Complete an approved deployment, confirm its commit, and record hosted build/runtime/media/cache/SEO acceptance evidence.
- Perform live Stripe setup and payment/refund acceptance only in the later explicitly approved phase.
- Keep public indexing disabled until the general launch gate passes. Imported pages remain excluded unless the separate source/content-quality gate is also approved.

## Import completion remains step 6

The existing manual/credentialed ingestion and administrator review foundation received compatibility/security and public-detail work. This does not complete automatic ingestion. Discovery/crawler/parser workers, recurring fetch schedules and retries, the source-update review inbox, source-change/removal polling and full operational acceptance remain deferred step-6 work. Source rights and import policy also require owner decisions. The original import audit also leaves duplicate-matching candidate growth, independent service-area timezone validation, published location corrections/reopening, and the imported-image/text-only product decision to resolve. Core launch should not depend on turning on an unfinished crawler.

Use the [public launch checklist](public-launch-checklist.md) to collect the outstanding evidence. A local build, benchmark or configuration pass does not authorize deployment, indexing, provider provisioning or real charges.
