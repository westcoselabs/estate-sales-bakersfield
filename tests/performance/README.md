# Isolated public-search database benchmark

Run only through the existing Development Neon schema lifecycle:

```powershell
pnpm exec tsx scripts/with-test-schema.ts -- node --conditions=react-server --import tsx scripts/benchmark-public-search.ts --run --smoke
pnpm exec tsx scripts/with-test-schema.ts -- node --conditions=react-server --import tsx scripts/benchmark-public-search.ts --run
```

The wrapper creates a fresh schema and restricted temporary login, applies checked-in migrations, strips real provider credentials and drops exactly that schema/login afterward. The benchmark independently verifies `APP_ENV=test`, the Development endpoint, generated schema/role and empty tables before inserting data. It refuses a Production or unscoped/shared-owner database. Do not invoke this against an existing application schema.

Full mode seeds **100,000 synthetic accounts and 10,000 listings**, split equally between immutable paid organizer publications and approved external listings. The account count includes one fixture administrator. Bulk SQL creates correlated approvals/payment records, sealed import batches/observations/candidates, confirmed locations, public IDs and publication snapshots with all existing triggers/constraints enabled. It does not disable invariants and does not call Stripe, Blob, email or geocoding. Synthetic provider IDs and image keys have no real objects behind them; this is a database benchmark, not a payment/photo workflow acceptance test.

Fixture dates, city selectivity, privacy modes and coordinates are deterministic. Each organizer listing has one photo. Listings span a 45-day window around the fixed clock, with expired, current/future, exact/approximate/hidden and out-of-city cases. The 100K users are stored database rows, **not concurrent visitors**.

For each scenario, the harness captures the **actual repository query**, runs `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, warms up three times, then measures queries at concurrency **1, 10 and 25**:

- First page, all types.
- First page, estate sales.
- Seven-day window.
- Broad map bounds.
- Tight map bounds.
- A cursor into later results.

Full mode takes 100 samples per scenario/concurrency; smoke mode uses 1,000 users, 100 listings and 25 samples. It preserves the repository's 25-row limit and records failures, rows returned, p50/p95/max latency, wall time and successful queries/second. Latency includes the client network path, pool wait and row mapping; the EXPLAIN plan separately records PostgreSQL execution time. All runs use one application process and the existing adapter's connection pool.

Reports are saved under `artifacts/performance/public-search-<test-run-id>.json`, including the current commit, dirty-working-tree flag, fixture/repository hashes, actual row counts and all query plans. Never equate warm local-to-Development results with production Vercel throughput, HTTP/Core Web Vitals performance, cold-start behavior or CDN/media delivery. Compare reports only when runtime, database compute/region, data distribution and measurement conditions are understood. Failed runs are recorded as failed; do not promote them as capacity evidence.

## Populated migration rehearsal

```powershell
pnpm exec tsx scripts/with-test-schema.ts -- node --conditions=react-server --import tsx scripts/rehearse-launch-migrations.ts --run
```

This uses the same guarded, disposable schema lifecycle. It first confirms the generated runtime identity and empty application tables. Only while empty, it removes the objects introduced by the two new launch migrations to restore their predecessor database structure. It then seeds the existing 100K-account/10K-listing fixture, including 5,000 immutable publications and a password-authenticated administrator session, and executes the exact checked-in migration SQL in transactional `DO` blocks.

The report verifies complete publication/search-record parity, every derived field, unchanged publication snapshots, valid indexes, cascading MFA foreign keys, and an existing session that still has no MFA proof. The original publication and ingestion constraints/triggers remain enabled. This exercises populated DDL/backfill behavior; it does not verify Prisma deployment orchestration, Production backup/restore, competing write traffic, or the target database's actual snapshot distribution. Reports go to `artifacts/performance/launch-migrations-<test-run-id>.json`; wrapper output confirms schema/role cleanup afterward.
