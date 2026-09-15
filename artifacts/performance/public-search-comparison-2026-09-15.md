# Public-search benchmark comparison

The branch-level filtering and 25-row limits reduced PostgreSQL execution time in five of the six measured search scenarios. The first-page merge now receives **50 rows instead of 7,063** before choosing the final 25 results. The tight-map query remains near one millisecond and still uses both spatial indexes.

## Evidence

- Baseline: [full report](public-search-testrun-mu214djo-c8be6361.json), captured 2026-09-15 02:05 UTC.
- Revised query: [full report](public-search-testrun-mu21a95p-9ff9f811.json), captured 2026-09-15 02:09 UTC.
- Both runs: Node 24.11.1; identical fixture SHA-256; 100,000 stored synthetic users, 5,000 organizer publications and 5,000 external listings; fresh restricted Development database schemas.
- Each run measured 100 searches per scenario at concurrency 1, 10 and 25: **1,800 samples, zero failures**, with 25 results returned by every measured search.
- The revised run completed successfully and the harness confirmed removal of its temporary schema. No production data or provider operations were used.

## Results

Values are baseline → revised. Server time is a single `EXPLAIN ANALYZE` execution per scenario. Client p95 and throughput below use concurrency 25; full reports also contain concurrency 1 and 10, p50, maximum latency, buffer counts and complete plans.

| Scenario          | PostgreSQL execution (ms) |   Client p95 (ms) | Successful queries/second |
| ----------------- | ------------------------: | ----------------: | ------------------------: |
| All first page    |            27.329 → 1.884 | 784.335 → 247.038 |          39.673 → 126.966 |
| Estate first page |            27.402 → 2.142 | 488.002 → 238.318 |          61.839 → 130.504 |
| Next seven days   |            15.682 → 1.782 | 241.122 → 202.909 |         112.099 → 136.838 |
| Broad map         |            32.449 → 2.108 | 477.686 → 259.342 |          62.781 → 114.999 |
| Tight map         |             0.925 → 0.990 | 151.249 → 182.630 |         183.454 → 150.410 |
| Later cursor      |            23.145 → 1.007 | 338.290 → 181.527 |          82.730 → 154.792 |

The first-page and broad-map plans now use ordered index scans and nested-loop lookups, stopping after 25 qualifying rows per source. Both source branches previously joined thousands of wide rows before the global sort. For the tight map, the planner continues to use `event_locations_viewport_gix` and `external_listing_locations_viewport_gix`; the final merge sees 48 rows.

## Interpretation and remaining work

This is evidence of lower database work on the synthetic fixture, not a production capacity certification. Stored accounts are not concurrent visitors. These warm-cache runs use one local process and its existing connection pool against Development Neon; network conditions and database compute were not experimentally controlled. Tight-map client throughput decreased in the revised run despite almost unchanged server work, so a universal latency improvement is not established.

At concurrency one, revised client p50 remains approximately 56–60 ms while server execution is approximately 1–2 ms. Network transit and adapter overhead therefore dominate this local measurement. Validate application/database region placement, pool pressure and complete HTTP latency in the eventual deployment before selecting a capacity target. Long histories also still cause the ordered first-page scans to skip expired rows: 1,015 organizer and 1,114 external rows in this fixture. Monitor that work as retained inventory grows.

Database integration tests remain the evidence for filtering, privacy and keyset correctness; this benchmark checks bounded result sizes and query failures, not complete semantic equivalence. HTTP traffic, cold starts, authentication, CDN/media delivery and provider workflows are outside this benchmark.
