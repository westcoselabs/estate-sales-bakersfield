# Prelaunch preparation — September 15, 2026

## Decision

**Local preparation has advanced; Production launch remains on hold.** Payments and deployment remain deferred as requested. This report covers the current uncommitted work on `main`; its base commit is `b92105e8b4ff432831748228e7e3b9edbfbe1811`. Existing launch-hardening changes remain in the same working tree.

| Area                   | Completed locally                                                                                                                                                                                                                                                              | Still required                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider configuration | Added sanitized read-only preflight; verified database/PostGIS, Blob token read, Geoapify public-city lookup and map-style response                                                                                                                                            | Verify actual Vercel variables, Resend sender/inbox/webhook, Sentry project and alert delivery, approved hosted media smoke                               |
| Policies               | Terms/privacy identify Brandon Francis and decoratedbyriley@gmail.com; describe cancellation/no refunds, verified public email, address privacy, providers, cookies, marketing consent and retention; new approvals use terms version `2026-09-15-v1`; mobile review completed | Policies remain unpublished with the deferred release; define operational retention/recovery targets and implement any future promises before adding them |
| Operations             | Daily-aware readiness warning; read-only monitor and disabled daily Actions workflow; incident/recovery runbook; synthetic dump/restore passed                                                                                                                                 | Activate and test alerts after release approval; verify actual Production recovery window and a separate-branch restore, including media recovery         |
| Scale validation       | Added reproducible 100K-account / 10K-listing HTTP benchmark, with real Development database and increasing concurrency                                                                                                                                                        | Final measurements below; hosted capacity, browser performance and daily worker throughput remain separate acceptance gates                               |

Existing unpaid drafts approved under the earlier policy version may need reapproval before checkout. Published snapshots and payment history are retained.

No Production migrations, hosted setting changes, deployment, actual emails, real charges or coupons were performed. The original step 6 import-completion work remains deferred.

## Provider evidence

[Latest read-only Production-file probe](../../artifacts/operations/provider-preflight-production-1789445206507.json): database/PostGIS, Blob reserved-prefix read, Geoapify and map style passed. This probes credentials in a local `.env` snapshot; it is **not** an inventory of deployed variables.

- Resend uses a sending-only key. Domain enumeration is denied by design; this does not establish a broken sending key. Keep least privilege and verify DNS/delivery through the provider account and a specifically requested inbox smoke.
- That local snapshot lacks `AUTH_FINGERPRINT_SECRET`, `PUBLIC_SUPPORT_EMAIL` and `SENTRY_DSN`. Check the hosted project before adding or changing values. Do not rotate an existing hosted secret based on this finding.
- Local Development deliberately uses capture/fake email/media adapters. Missing real-provider keys in `.env.local` do not invalidate those tests. Live local address-provider validation needs a separate Development credential.
- Hosted configuration access and Sentry project details were not available in this session.

Commercial hosting is an independent blocker: [Vercel Hobby restricts use to personal, non-commercial projects](https://vercel.com/docs/plans/hobby). The requested daily schedules are retained, but commercial operation needs an eligible plan or host.

## Recovery evidence

[Successful rehearsal](../../artifacts/operations/backup-restore-testrun-mu25dxis-99cc8719.json): PostgreSQL 18.6 clients, 1,000 synthetic users, 100 synthetic listings, **39 tables and 1,769 total rows verified** after restore. Dump: **9.399 seconds**. Restore: **42.577 seconds**. Archive: 355,064 bytes. The restricted disposable Development schema was removed after completion.

Two earlier failed reports remain as an audit trail. The initial rehearsal encountered a PostgreSQL `name`-type deserialization problem in its inspection query; casting identifiers to text corrected the script. The successful result supersedes those failures. This result does not prove Production retention, full-catalog restore time, Blob recoverability or a contractual recovery target.

## Monitoring behavior

`JOB_MAX_QUEUE_DELAY_MINUTES=1500` gives daily work a 25-hour queue-delay allowance. Running locks still warn after 15 minutes. Dead jobs and blocked/manual-review payments remain warning conditions. HTTP 200 with `status: warning` is a failure in the new monitor.

The workflow checks once daily at 11:30 UTC after the 09:00/10:00 UTC worker windows; it remains disabled unless `PRODUCTION_MONITOR_ENABLED=true`. It only reads status. Alerts and workflow failure notifications are not yet proven delivered. Daily checking can delay detection; Sentry alert setup is still required for prompt runtime failures.

## Verification

- `pnpm verify:credential-free`: **PASS** — formatting, lint, architecture (593 modules / 1,499 dependencies), TypeScript, Prisma validation, production dependency audit, 512 unit tests and 32 provider-contract tests. Statement coverage 40.49%; all configured coverage thresholds passed. No known production dependency vulnerabilities found at this check.
- New targeted checks: optional MFA launch configuration, daily queue timing, monitor authorization/network/JSON-warning behavior and approval-policy version passed.
- Terms and privacy rendered correctly at 390 × 844 with the operator and support contact visible.
- Browser smoke: **47 scenarios passed across the full run and focused rerun**. The full run passed 45; two test-helper failures were corrected (wait for import sign-in to finish; expect dashboard instead of forced MFA). Both affected scenarios then passed on a fresh isolated build/schema. No application authentication guard was weakened to make these tests pass. Fixture payment tests do not verify live Stripe. [Machine-readable smoke evidence](../../artifacts/operations/smoke-verification-2026-09-15.json).
- TypeScript and focused test-file lint/format checks passed after the helper fixes. Corrected HTTP scale measurements follow below.

## Scale measurements and limits

The first HTTP run used sample sales ending before the current Los Angeles evening. `/sales-today` correctly returned an empty page, while the harness incorrectly required a visible fixture listing. Its report records those content-check failures despite HTTP 200 for every request; it is not a valid route-acceptance or clean capacity result. The fixture now includes an ongoing sale. Concurrent verification activity also affected the first run's warm stage. Retained diagnostic report: [first HTTP run](../../artifacts/performance/http-scale-testrun-mu25g0vh-9e32d129.json).

The corrected run measures a local Next production build with `APP_ENV=test`, synthetic providers, a real Development Neon database, a 32-connection restricted role and separate simulated visitors. Shared application caching is deliberately bypassed in test mode. It excludes CDN behavior, hosted autoscaling/cold starts, browser downloads/rendering, uploads, login bursts and background-worker throughput. **100K stored users is not 100K concurrent visitors.**

### Final reproducible HTTP result

[Final raw evidence](../../artifacts/performance/http-scale-testrun-mu264aze-fec9fe76.json), with explicit `ANALYZE` on 13 fixture tables before warmup:

| Concurrent requests | Measured requests | Overall p95 | Requests/second | Failed requests |
| ------------------- | ----------------- | ----------- | --------------- | --------------- |
| 5                   | 120               | 337 ms      | 24.23           | 0               |
| 20                  | 120               | 956 ms      | 31.52           | 0               |
| 50                  | 300               | 2,365 ms    | 33.56           | 0               |
| 100                 | 600               | 3,804 ms    | 39.41           | 0               |

All **1,140 measured requests plus 6 warmup requests** returned HTTP 200 and actual fixture content. The first six requests had p95 **3,468 ms**, reported separately from the warm stages. The functional load test passed; its capacity status is **`capacity-review-required`** because the 50/100 stages exceed the provisional one-second p95 budget. Passing request correctness is not passing the latency target. At concurrency 100, `/search` was the slowest measured route at **4,121 ms p95**.

The preceding [valid-fixture run without explicit statistics](../../artifacts/performance/http-scale-testrun-mu25zwld-f1b423bc.json) also had zero errors but started at 5,251 ms p95 at concurrency 5. Explicit analysis avoids depending on background auto-analysis after bulk loading. Its much faster low-concurrency rerun is consistent with that change, but these sequential runs do not isolate every cache/provider timing effect. High-concurrency latency remains slow in both runs.

### Prioritized performance follow-ups

1. **Profile the full hosted request path before claiming capacity.** Capture connection wait, database query time, SQL rate-limit writes, server rendering and cold starts separately. The local process shows saturation as concurrency rises; these timings alone do not identify one proven root cause.
2. **Verify the existing shared cache on the intended host.** This test bypasses it. Preserve visibility-revision checks and privacy invalidation; measure cache hits/misses with the real publication/update flow rather than merely extending cache lifetimes.
3. **Review database pool and rate-limit load from those traces.** Search currently adds an SQL rate-limit write per request before reading results. A dedicated distributed limiter is a possible follow-up if measured write/pool pressure warrants it; do not replace shared protection with an in-memory limit or blindly raise connection counts.
4. **Include planner statistics in bulk-load/migration acceptance.** Inspect plans and current statistics after significant data backfills. The benchmark now does this only for its generated schema. No Production analysis or migration was executed.
5. **Run hosted browser/media/login and queue-load acceptance.** Current results cover six discovery endpoints, not image delivery, simultaneous uploads, login hashing, admin reporting or worker throughput. Daily worker service capacity remains a separate bottleneck.

The daily worker ceiling remains up to 50 admissions per invocation, subject to its time budget. A 100K-account audience can overwhelm that cadence even when search is fast. Measure jobs produced per organizer action and actual daily drain capacity; upgrade scheduling before sustained backlog develops.

## 100% coupon

Use a **Stripe coupon and promotion code**, with redemption limits and expiry chosen for the intended audience. The website needs Checkout-code entry and safe fulfillment of zero-total orders. It currently disables promotion codes and requires the original full amount plus a PaymentIntent. Stripe [no-cost orders may not have a PaymentIntent](https://docs.stripe.com/payments/checkout/no-cost-orders?locale=en-GB), so creating a coupon alone will not complete this feature. Preserve webhook, account, currency and approved-revision checks while adding discounted-total handling. Implementation and coupon creation remain in the deferred payments phase.

See [provider, monitor, recovery and coupon procedures](provider-and-recovery-runbook.md) for exact commands and acceptance steps.
