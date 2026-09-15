# Providers, monitoring and recovery

Operator and incident owner: **Brandon Francis**. Public support: **decoratedbyriley@gmail.com**.

This is preparation for the deferred release. No hosted settings, deployment, payment credentials or Production migrations were changed by this work.

## Provider configuration

Use provider dashboards or an authenticated integration to compare **setting names and resource identities** with the existing Production project. A local `.env` file is not the hosted source of truth. Never print secrets in a report, copy Production keys into Development, or regenerate a secret just because a local snapshot omits it.

| Provider    | Required configuration                                                                                                                                                                                               | Acceptance evidence still needed                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vercel      | Approved canonical HTTPS `APP_URL`; matching region; independent `AUTH_FINGERPRINT_SECRET` and `CRON_SECRET`; `PUBLIC_SUPPORT_EMAIL=decoratedbyriley@gmail.com`; daily schedules; `JOB_MAX_QUEUE_DELAY_MINUTES=1500` | Hosted inventory, plan eligibility, domain redirects, runtime readiness, observed successful daily jobs                                                |
| Neon        | Pooled `DATABASE_URL`, direct migration `DIRECT_URL`, `DATABASE_RESOURCE_ENV=production`; keep Development separate                                                                                                  | Actual restore window, snapshot/backup access and retained recovery point; release migration status; Production-derived restore into a separate branch |
| Vercel Blob | Production private store and token with `BLOB_RESOURCE_ENV=production`                                                                                                                                               | Upload, protected serving, cancel/removal and orphan cleanup in an approved smoke fixture                                                              |
| Resend      | Verified sending domain, sending-only `RESEND_API_KEY`, `RESEND_FROM`, Production resource marker, endpoint-specific `RESEND_WEBHOOK_SECRET`                                                                         | Dashboard DNS verification; requested verification/reset/receipt received by an owner-controlled inbox; signed delivery webhook recorded               |
| Geoapify    | Server-only `GEOAPIFY_API_KEY`, appropriate project restrictions and quota                                                                                                                                           | Hosted address selection and confirmation, provider-failure behavior; separate Development credential for local live-provider checks                   |
| Maps        | `NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty`                                                                                                                                             | Hosted tile requests, attribution and exact/approximate/hidden address behavior on mobile                                                              |
| Sentry      | `SENTRY_DSN`; optional browser `NEXT_PUBLIC_SENTRY_DSN`; environment labels and alert recipient                                                                                                                      | Project access, redacted test event received, alert delivered and acknowledged                                                                         |
| Stripe      | Deferred to the payment phase                                                                                                                                                                                        | Live credentials, price, webhook, reconciliation and coupon acceptance                                                                                 |

MFA is optional in the application. Its encryption key is required only for administrator enrollment. An already-enrolled administrator still needs their second factor for protected administrator actions. Do not disable enrollment records to bypass a login issue.

Read-only connection checks:

```powershell
pnpm exec tsx scripts/check-provider-connections.ts --run --env-file=.env.local
pnpm exec tsx scripts/check-provider-connections.ts --run --env-file=.env
```

The second command deliberately uses the local Production snapshot for read-only probes. Neither command mutates resources, sends mail or proves the hosted configuration. Local capture/fake adapters do not require live Blob/Resend keys; a missing live probe there is expected. Resend sending-only keys cannot enumerate domains: inspect DNS in its dashboard rather than granting broader permission solely for a probe.

Keep public/import indexing and campaign dispatch disabled during preparation. Vercel [Hobby is restricted to personal, non-commercial use](https://vercel.com/docs/plans/hobby); daily scheduling does not remove that restriction. Select Pro or another commercially permitted host before commercial use. No upgrade is performed by this runbook.

## Daily monitoring

Workers remain at 09:00 and 10:00 UTC daily. Hobby execution can occur within those hours. The checked-in monitor is scheduled for 11:30 UTC, once daily. Its job is disabled unless repository variable `PRODUCTION_MONITOR_ENABLED=true`; leave that unset until release acceptance. Configure Actions secrets `PRODUCTION_APP_URL` and `PRODUCTION_CRON_SECRET` from the intended Production project. Enable failed-workflow notifications on the responsible operator account and verify a deliberate test failure before relying on it. GitHub schedule timing is not a guaranteed alert SLA.

The monitor **only reads** `/api/health` and protected `/api/internal/readiness`; it does not run workers. It checks JSON, not only HTTP 200, and fails on warnings, malformed results, timeouts or denied authorization. Authorization is sent only to the configured HTTPS origin, without redirects. Manual invocation:

```powershell
pnpm exec tsx scripts/check-operational-readiness.ts --run
```

Supply `APP_URL` and `CRON_SECRET` through the environment, not command arguments or a committed file. Queue-age warning is 25 hours from `runAt`; running leases warn after 15 minutes. Dead jobs, failed Resend webhooks and blocked/manual-review payments warn immediately when checked. With daily checks, notification itself can be delayed nearly a day. Sentry should provide faster error alerts once configured.

### Incident response

1. Brandon checks the failing route/status and warning counts, then correlates request IDs with redacted Vercel/Sentry logs. Do not paste tokens, payment payloads or customer details into tickets.
2. Database/unavailable: inspect Neon health, connection limits and deployment configuration; pause release/indexing changes and preserve the last known working application version.
3. Dead/overdue jobs: identify job types and provider errors. Repair the provider/configuration issue first; use existing bounded worker/retry procedures and idempotency keys. Never mark work successful manually. Daily admission is **up to** 50 jobs per invocation; sustained arrivals beyond successful daily service capacity require a scheduling/worker upgrade.
4. Blocked/manual-review payments: preserve the payment attempt and approved revision. Reconcile using the documented payment command; never publish from the success redirect or bypass webhook correlation. Payments remain deferred for this preparation.
5. Failed mail: inspect Resend delivery status, sender domain, suppression and signed webhook processing. Retry only through existing idempotent job handling; do not bulk resend campaigns.
6. Security/account issue: revoke affected sessions and investigate. Do not email passwords/reset tokens. For optional enrolled MFA, follow the dedicated recovery runbook.
7. Record the incident, cause, recovery evidence and follow-up. Confirm health, readiness counts and affected user journey after recovery.

## Recovery rehearsal

The synthetic rehearsal verifies dump/restore mechanics, schema objects, constraints and every table's contents. It is not proof of Production backup retention, Blob recovery or recovery at full catalog size.

Install PostgreSQL client tools at least as new as the target server; this Neon database runs PostgreSQL 18. PostgreSQL 16 `pg_dump` cannot dump it. Official [Windows client distribution](https://www.postgresql.org/download/windows/) is available through EDB. This workspace used PostgreSQL 18.6 clients under ignored `.tmp/postgresql18/bin`.

```powershell
$env:PG_CLIENT_BIN = Join-Path (Get-Location) '.tmp/postgresql18/bin'
pnpm exec tsx scripts/with-test-schema.ts -- node --conditions=react-server --import tsx scripts/rehearse-backup-restore.ts --run
```

The wrapper creates and removes a restricted disposable Development schema. The rehearsal seeds synthetic data, dumps that exact schema, restores its objects inside the same disposable container, and compares sorted content hashes and counts for all tables. It does not access the application schema. Reports go to `artifacts/operations`; the ignored archive contains only synthetic data.

Before Production release, record the provider's actual restore-history window and a recovery point. Restore to a **separate** branch first, validate schema/migration state and row counts, then rehearse application login/search and Blob references. Document how media would be recovered: a database backup alone does not contain Blob objects. Record actual recovery time and possible data loss; owner-approved recovery-time and data-loss targets remain undecided. A failed application deployment can be rolled back to a compatible build; schema rollback requires an explicit reviewed plan, not `migrate reset` or `db push`.

## Scale reproduction

```powershell
pnpm exec tsx scripts/with-test-schema.ts -- pnpm exec playwright test --config=playwright.performance.config.ts
```

This bounded HTTP benchmark seeds 100K users and 10K listings, explicitly updates statistics on its 13 owned fixture tables, then tests list/map API and server-rendered discovery pages at concurrency 5, 20, 50 and 100. It retains the SQL rate limiter and simulates separate visitors. The local production build uses test adapters and bypasses the shared application cache. No CDN, browser asset timing, hosted function cold starts or multi-instance capacity is measured. Provisional review thresholds are p95 below 1 second and errors below 1%; they are engineering review thresholds, not an agreed service-level promise. Repeat on an approved representative hosted environment before claiming Production capacity.

## Full-discount coupon plan — deferred payment phase

Manage the 100% coupon and redeemable promotion code in **Stripe**. The website should expose Stripe Checkout's code field and safely fulfill a validated zero-total order. Choose private/public distribution, expiry, redemption count and eligible users before activation.

Current blockers: Checkout sets `allow_promotion_codes=false`; fulfillment expects the original full amount and a PaymentIntent. Stripe's [no-cost Checkout orders](https://docs.stripe.com/payments/checkout/no-cost-orders?locale=en-GB) can complete without a PaymentIntent. Implementation must record and validate original price, discount, currency and final total, accept only the verified `no_payment_required` flow when total is zero, and preserve signed webhook, account, session and approved-revision correlation. Do not broadly remove amount checks or add a browser-only bypass. Test valid 100%, partial/expired/ineligible codes, tampered metadata, duplicate webhooks, missing PaymentIntent and normal paid orders. No coupon or payment behavior changed in this preparation.
