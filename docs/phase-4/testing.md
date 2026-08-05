# Phase 4 Testing

Credential-free unit coverage owns eligibility, exact approval/digest matching, state mapping, address release, environment guards, migration checksums/invariants, provider sanitization, and reconciliation decisions. The offline Stripe contract project mocks the application-owned transport boundary and verifies hosted Checkout request construction, server price/URLs/metadata, expanded line-item retrieval, raw-body verification, and safe errors.

Disposable schemas inside Development Neon create real approvals and payment attempts and cover active-attempt reuse, ownership denial, immutable correlation, webhook deduplication/out-of-order delivery, atomic publish/rollback, unpaid Sessions, six mismatch classes, stale paid revisions, reconciliation success/retry, durable-job registration, public availability, and hidden-address redaction. Playwright performs two deterministic fake-Checkout cases: a complete published listing and a paid stale revision that remains private. The fake completion route invokes the same signed webhook service; navigating to success alone cannot publish.

```text
pnpm test:unit
pnpm test:contract:stripe
pnpm test:integration
pnpm test:e2e
pnpm verify
```

Ordinary tests never require card entry or real Stripe credentials. Historical Preview-provider checks in the acceptance report are retained only as historical evidence; Preview is not part of the current operating topology.
