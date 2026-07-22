# Phase 3 Testing

Credential-free unit tests cover state/readiness, privacy projections, DST conversion, approval digests, migrations, environment guards, image sanitation, rate-limit policy, and sanitized database-failure mapping. Location, image, media, and email boundaries use deterministic contracts/mocks. Test Neon integration covers real PostgreSQL rate-limit thresholds, expiry, concurrency, environment isolation, cleanup, constraints, PostGIS, ownership, optimistic conflicts, photos, approval, terms, audit, and migration ordering. Playwright uses Test Neon rate limits and the existing non-database test adapters.

```text
pnpm test:unit
pnpm test:contract:email
pnpm test:contract:blob
pnpm test:contract:location
pnpm test:contract:image
pnpm db:test:check
pnpm test:integration
pnpm test:e2e
```

An authored database or browser test is not evidence of execution. See the Phase 3 acceptance report for `PASS`, `BLOCKED`, and `NOT RUN` results.
