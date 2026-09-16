# Public launch verification

**September 15 launch update:** The owner has now authorized deployment, live Stripe setup and public SEO launch. The domain and Pro schedules are deployed. Public indexing is now an independent Production opt-in, so payment activation does not block the directory sitemap. See [analytics and Search Console](analytics-and-search-console.md) and [Stripe live setup](stripe-live-launch.md). Earlier deferrals below describe the preparation phase and no longer override these owner instructions.

Application preparation and a paid public launch are separate milestones. Live Stripe is explicitly deferred until the application is complete. Do not switch credentials, enable indexing, send campaigns, create provider resources or promote a deployment merely to make a check turn green.

September 15 preparation now includes operator-specific policy drafts, read-only provider probes, a disabled daily monitoring workflow, synthetic backup/restore verification and HTTP scale tooling. See [provider and recovery procedures](provider-and-recovery-runbook.md) and [the current evidence report](prelaunch-readiness-2026-09-15.md). Local evidence does not close hosted-provider or release gates.

## 1. Reproducible application verification

Record the commit, command, environment class, date and result for each check. An earlier successful report is not evidence for a changed commit.

```powershell
pnpm verify:credential-free
pnpm verify
```

The credential-free command includes formatting, lint, architecture, TypeScript, Prisma validation, the production dependency audit, unit coverage and mocked provider contracts. `pnpm verify` additionally uses the guarded Development Neon test-schema workflow for build/integration/Playwright. If environment isolation blocks a command, resolve the actual development configuration; do not remove the guard or substitute production credentials.

Require a clean production dependency audit at release time, including transitive packages. Review the release diff and migration plan. Run the search query-plan/performance checks and the new concurrent resource-admission integration tests against representative, isolated data. Define expected peak requests/second, concurrent sessions, upload rate and catalog size; a total of 100K users alone is not a load-test target. Record mobile performance and actual p95 request/queue latency before claiming capacity.

## 2. Configuration gate, without provider side effects

```powershell
pnpm exec tsx scripts/check-release-config.ts preparation
```

This read-only command examines the existing process environment. It does not load `.env` files, contact providers, print credentials or change settings. Run it in the intended environment or deliberately load the correct environment before invoking it. Preparation permits fixture/test payments and requires public indexing and campaigns to remain disabled. A `configuration: pass` means only that these configuration checks passed; operational evidence remains explicitly `not-verified`.

For a local production-runtime configuration check, set `NODE_ENV=production` in that shell and run `node --env-file=.env.local --import tsx scripts/check-release-config.ts preparation`. This still checks the local environment, and does not establish Production readiness.

Once the application is complete and the separately approved live payment setup is ready:

```powershell
pnpm exec tsx scripts/check-release-config.ts public-launch
```

This requires the production posture, coordinated beta/live/indexing flags and the required backend settings. It still does not prove provider ownership, webhook delivery, domain control, mailbox delivery, backups, legal approval or capacity. Do not change production variables as part of a local check.

## 3. Operational evidence required before public launch

| Gate                  | Evidence to record                                                                                                                                      | Current preparation status                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Hosting/scheduler     | Confirm selected Vercel plan or approved worker host, deployed cadence, function duration and observed queue-drain capacity                             | Owner selected daily schedules until Pro upgrade; queued work may wait about a day                             |
| Queues and monitoring | Protected readiness is monitored; blocked paid payments, dead jobs and overdue work generate an actionable alert; test recovery without real charges    | Requires deployment evidence                                                                                   |
| Account security      | Verify administrator password/session controls; MFA enrollment is optional and requires its encryption key; verify provider-account security separately | Mandatory app MFA deferred by owner; unenrolled administrators use password-only access                        |
| Database recovery     | Backup/restore evidence and migration rollback/recovery plan for the target database                                                                    | Requires operational verification                                                                              |
| Import operations     | Approved source identities/rights, credential revocation, staged review, duplicate handling, removal and scheduled expiry checked end to end            | Requires feature acceptance evidence                                                                           |
| Support               | Set `PUBLIC_SUPPORT_EMAIL` to a verified owner-controlled inbox; `/contact` displays it, with a responsible owner and response process                  | Inbox approved: decoratedbyriley@gmail.com; Production setting and delivery check pending                      |
| Terms/privacy/refunds | Owner-approved public wording covering actual payment/refund/cancellation behavior and data practices                                                   | Brandon Francis operator terms/privacy drafted locally; cancellation/no-refunds included; publication deferred |
| SEO/domain            | Approved canonical HTTPS domain, successful rendering/canonical redirects, structured data, crawlable content and gated sitemap/robots checks           | Keep indexing disabled during preparation                                                                      |
| Live payments         | Approved live Stripe account/Price/currency, endpoint-specific live webhook secret, fulfillment/reconciliation/receipt/refund procedure                 | Explicitly deferred until app completion                                                                       |

The current daily schedules cannot provide prompt high-volume receipt/cleanup processing. The workers now admit up to 50 jobs/run subject to their time budget; that is a cap, not guaranteed throughput. See [resource limits and workers](resource-limits-and-workers.md). Vercel documents Hobby's once-daily and hourly precision restrictions in its [cron usage guide](https://vercel.com/docs/cron-jobs/usage-and-pricing). Decide capacity from the actual deployed plan rather than changing `vercel.json` to a schedule the plan cannot run.

MFA status is an external/account fact, not something the health endpoint can infer. Provider MFA also does not add a second factor to this application's own administrator login. Confirm the application control separately. Vercel provides [account two-factor authentication](https://vercel.com/changelog/2fa-is-now-available); enabling it and storing recovery codes remains an account-owner action unless specifically delegated.

Stripe test and live API keys access different modes, and webhook endpoints have their own secrets; follow [Stripe's key guidance](https://docs.stripe.com/keys) during the deferred live setup. A successful fixture Checkout or test payment does not establish live readiness.

## 4. Promotion and indexing

`vercel.json` pins functions to `pdx1` (Portland / `us-west-2`), matching the configured Neon region. Keep application compute near its database when moving either provider; Vercel documents its [region mapping and database proximity guidance](https://vercel.com/docs/regions). This setting takes effect with deployment; local measurements do not establish hosted latency.

After all required evidence is recorded, use the existing reviewed migration/deployment process. Verify the deployed build matches the accepted commit. Check protected runtime readiness and public routes without creating real charges. Enable public indexing only through the explicit production launch gate once the domain, content and live-payment posture are complete. Continue excluding search filters and private routes from indexing. Submit the verified sitemap and observe crawl errors after the gate is enabled.

Imported detail pages remain `noindex` and excluded from sitemaps after public launch by default. Set `PUBLIC_IMPORTED_INDEXING_ENABLED=true` only after separately reviewing the sources, content quality and duplication risk. This also requires `PUBLIC_INDEXING_ENABLED=true`; the gate does not authorize acquisition from additional sources.

Do not treat this checklist or a static configuration pass as authorization to deploy, enable paid services or publish policy text. Preserve the user's explicit deferral of real Stripe integration.
