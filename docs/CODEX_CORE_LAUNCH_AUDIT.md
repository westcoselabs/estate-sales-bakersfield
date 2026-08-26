# Codex Core Launch Audit Handoff

> Audit snapshot: 2026-08-25 local time. Baseline `main` SHA before this documentation commit: `e127902d89e610048de608f6d02a404abef3ba52` (`Phase 5`).
>
> This document is a handoff and planning aid, not a substitute for inspecting the current code. Codex must verify every important claim against the current `main` branch before changing implementation.

## Mission

Finish and launch the **core Estate Sales Bakersfield application and backend administration system** from a single canonical `main` branch.

The recently merged `listing-imports` foundation is **not a launch dependency**. The automatic EstateSales.org scraper/crawler is deferred until after the core product launches.

The immediate goal is a boring, trustworthy release baseline:

1. `main` is secure and dependency-clean enough to ship.
2. formatting, lint, architecture, TypeScript, Prisma, unit, contract, integration, E2E, and production build gates are green.
3. the complete organizer/customer flow works end-to-end.
4. the current Production beta deploys successfully and passes hosted acceptance.
5. before additional super-admin work, pause for a deliberate UI/admin/email inventory and design review.

## Non-negotiable project decisions

- Work directly on `main`. Do **not** create another implementation branch unless the user explicitly changes this decision.
- Never force-push `main`.
- Do not introduce Docker, Testcontainers, or local PostgreSQL. The project intentionally uses Development Neon plus isolated per-run test schemas.
- Do not create or rely on Vercel Preview deployments, Preview databases, Preview provider resources, or Preview webhooks.
- Do not rotate, replace, or create Production provider credentials merely to make tests pass.
- Do not weaken environment guards, database safety checks, authorization, privacy rules, approval invalidation, webhook authority, idempotency, or tests to get a green build.
- Preserve the Production-beta model until a later explicit public-launch decision: `APP_ENV=production`, `PRODUCTION_BETA_MODE=true`, Stripe test mode, Production resource markers, and `noindex`.
- Keep server-authoritative Stripe pricing. Never accept listing price/amount as browser authority.
- Keep Stripe webhook/reconciliation as publication authority; the Checkout return page must not publish by itself.
- Preserve exact-address privacy and server-mediated Geoapify usage.
- Treat `src/modules/listing-imports` as merged but deferred. Do not build the scraper/crawler during core launch hardening and do not make core launch depend on imported listings.
- At the Super Admin phase, **stop before implementing new admin/UI/email features** and first perform the Phase C inventory described below.

## Start here: repository reading order

Before proposing changes, inspect at minimum:

1. `README.md`
2. this file: `docs/CODEX_CORE_LAUNCH_AUDIT.md`
3. `DESIGN.md` for current UI/design intent where relevant
4. `docs/architecture/overview.md`
5. `docs/architecture/authentication.md`
6. `docs/architecture/events.md`
7. relevant ADRs under `docs/adr/`, especially current auth, location, payment, email, and map/provider decisions
8. `docs/operations/environments.md`
9. `docs/operations/development-neon-testing.md`
10. `docs/operations/production-beta-verification.md`
11. `docs/operations/live-verification.md`
12. `docs/contracts/listing-import-v1.md` only to understand the deferred import boundary
13. `package.json`, `vercel.json`, `.github/workflows/ci.yml`, `scripts/verify.ts`, `scripts/vercel-build.ts`, `scripts/local-runtime-environment.ts`
14. `prisma/schema.prisma` and the complete immutable migration history

Then inspect the application by module and route instead of assuming the documentation is current.

## Current repository shape

The application is a strict-TypeScript Next.js App Router modular monolith. Current high-level modules include:

```text
src/app                 pages, route handlers, transport/composition
src/modules/admin       super-admin reporting/management/moderation
src/modules/auth        accounts, sessions, verification/recovery, abuse controls
src/modules/email       templates, rendering, transactional/campaign jobs, Resend adapter
src/modules/events      drafts, lifecycle, schedules, approval/revision policy
src/modules/jobs        PostgreSQL durable work queue
src/modules/listing-imports  merged ingestion/review/external-listing foundation; deferred for launch
src/modules/locations   structured address/location validation and privacy projections
src/modules/media       upload reservations, private objects, image processing
src/modules/organizers  organizer onboarding/profile
src/modules/payments    hosted Checkout, webhook evidence, reconciliation, publication
src/modules/public-search public listing discovery/search projections
src/platform            env/config, database, security, logging/observability
prisma                  schema and immutable migrations
tests                   unit, contract, integration, E2E, visual tests
```

Dependency Cruiser is intended to enforce module/layer boundaries. Keep domain/application code provider-neutral and provider SDKs in infrastructure/composition layers.

## Current observed baseline from merged `main`

The latest GitHub Actions Verification run for baseline SHA `e127902...` failed, but it produced substantial positive evidence.

### Passing evidence

- dependency installation succeeds with the pinned Node/pnpm toolchain
- ESLint passes
- Dependency Cruiser passes: 526 modules / 1290 dependencies, no violations
- TypeScript `tsc --noEmit` passes
- Prisma schema validation passes
- unit suite passes: **84 files / 416 tests**
- Blob contract suite passes: 20 tests
- email contract suite passes: 4 tests
- location contract suite passes: 3 tests
- image contract suite passes: 1 test
- Stripe contract suite passes: 4 tests

Do not discard or rewrite working architecture merely because the overall workflow is red.

### Known blockers observed in that run

#### 1. Formatting gate

`pnpm format:check` reports 13 files:

```text
src/app/_components/public-listing-detail-tabs.tsx
src/app/foundation.css
src/app/yard-sales/page.tsx
src/components/shells/shells.tsx
src/features/marketing/components.tsx
src/features/search/explore-results.tsx
src/modules/auth/application/guards.ts
src/modules/auth/application/ports.ts
src/modules/auth/index.ts
src/modules/email/infrastructure/configured-email.ts
src/modules/payments/application/payment-service.ts
src/modules/public-search/application/criteria.ts
tests/unit/public-search/criteria.test.ts
```

Formatting should be a mechanical fix followed by verification that no semantic changes occurred.

#### 2. Production dependency audit

The baseline `pnpm audit:prod` reports two HIGH transitive advisories:

- `nanoid < 3.3.18`, currently reached through `next -> postcss -> nanoid`
- `deepmerge-ts < 8.0.0`, currently reached through Prisma configuration dependencies

Re-audit after the required Next.js upgrade before deciding remediation. Prefer compatible patch/minor updates or narrowly justified overrides with tests. Do not jump to a Prisma major solely to silence the audit without reviewing migration/runtime compatibility.

#### 3. Next.js security baseline

`package.json` currently pins Next.js `16.2.11` and `eslint-config-next` `16.2.11`.

As of 2026-08-25, Next.js `16.3.3` contains security fixes for critical advisories affecting the current 16.2.11 line. Treat upgrading Next.js and matching Next tooling to at least the patched release as a P0 launch gate, then rerun all verification/build checks and inspect behavior changes.

#### 4. Development Neon CI is BLOCKED by missing Actions secrets

The `development-neon` job expects these GitHub Actions secrets:

```text
DEVELOPMENT_DATABASE_URL
DEVELOPMENT_DIRECT_URL
DEVELOPMENT_NEON_ENDPOINT_ID
PRODUCTION_NEON_ENDPOINT_ID
```

In the observed run all four values resolved empty and the job stopped at `BLOCKED - DATABASE_URL is not configured`.

Codex must not invent these values. This is a human/provider configuration action. Once configured, the guard must still prove that Development and Production endpoint identities differ before integration/E2E run.

#### 5. Current integration/E2E evidence is incomplete

Because the Development Neon identity gate blocked the run, the current merged `main` has not yet produced fresh CI evidence for:

- Development-schema database check
- integration suite
- Playwright E2E suite

Do not call the release green until these run against the guarded Development Neon workflow.

## Vercel Hobby cron decision

GitHub confirmed that Vercel saw the merged `main` SHA and reported `Deployment failed`; the Git integration was therefore not simply stale or disconnected. The Jul 31 deployment visible during the audit was the last successful Production deployment.

The configuration-level cause was:

- the Vercel project is currently on the **Hobby** plan
- `vercel.json` defined two native Vercel cron jobs
- both schedules were `* * * * *` (every minute)
- current Vercel Hobby Cron limits allow a cron to run only once per day; more frequent expressions fail deployment validation

Current jobs:

```text
/api/internal/jobs/run
/api/internal/email-jobs/run
```

The first processes maintenance/durable work including auth rate-limit cleanup, payment reconciliation, media purge, and deferred external-listing expiration. The second processes queued receipt/campaign/contact-subscription email work.

### Decision recorded 2026-08-26

The owner selected the Hobby-compatible beta tradeoff. The schedules are now:

- `/api/internal/jobs/run`: `0 9 * * *`
- `/api/internal/email-jobs/run`: `0 10 * * *`

Vercel evaluates these schedules in UTC. Hobby timing is hourly rather than exact, so each route may run at any point in its configured hour. Separating the hours avoids deliberately overlapping the two database-backed workers.

Normal signed Stripe webhook fulfillment remains immediate and authoritative. The daily maintenance worker is a recovery path for missing or delayed webhooks and also handles cleanup/purge work. The daily email worker means queued purchase receipts and contact-subscription synchronization may wait roughly one day; campaigns remain disabled. At the current batch limit of 10, a backlog larger than one batch can carry into a later day. This latency and capacity tradeoff is accepted for the Production beta, not for a later higher-volume public launch.

An external scheduler is not being introduced. If near-real-time recovery or queue delivery becomes a launch requirement, revisit a Pro upgrade or another explicitly reviewed scheduling architecture.

After the configuration is committed and pushed, inspect the fresh Production deployment's actual Vercel build logs. Do not assume cron validation was the only Vercel issue until the deployment reaches `READY`.

## Deferred listing-import/scraper boundary

`listing-imports` is now in `main`, but distinguish two different systems:

### Already merged

- ingestion contract/API
- ingestion credentials and rate limiting
- canonical normalization/content hashing
- idempotency and duplicate handling
- manual JSON/CSV import support
- admin candidate review/edit/approve/reject/delete
- external listing lifecycle/public-search integration
- EstateSales.org source configuration
- database invariants and tests

### Not implemented / not part of core launch

- automatic EstateSales.org discovery
- crawler/fetch worker
- site-specific parser
- recurring crawl scheduler
- crawl retries/error handling
- source-change/removal polling
- automatic production ingestion

Do not spend core-launch time implementing the missing crawler. Audit the merged import code only enough to ensure it does not break, expose, or become a hard dependency of the core application. Keep it dormant if unused.

## Codex Plan Mode: audit procedure

### Mode rule

**Audit and plan only first. Do not edit code during the initial audit.**

The first Codex response/run should inspect the repository, execute safe read-only verification commands where possible, and return findings plus a proposed implementation sequence. Wait for explicit approval before making implementation changes.

For every finding:

- classify it `P0 launch blocker`, `P1 core completion`, `P2 later hardening`, or `DEFERRED`
- cite concrete `file:line` evidence and/or exact command result
- explain user impact and security/data risk
- separate confirmed defects from suspected risks or missing evidence
- state the smallest safe fix
- state acceptance criteria and tests

Do not produce a generic best-practices checklist detached from this codebase.

### Audit areas

Inspect these areas in order:

1. **Git/release baseline** — current `main`, merged history, working tree, Vercel/Git configuration, no unintended branch assumptions.
2. **Dependency/security baseline** — Next.js, React, Prisma, Sharp, Stripe, Resend, MapLibre, production audit and applicable advisories.
3. **Build/environment model** — env schema, local guard, Vercel build wrapper, Production beta variables, provider resource markers, no Preview dependency.
4. **Prisma/migration safety** — immutable migrations, PostGIS, current schema/migration consistency, listing-import migration impact, no destructive reset path.
5. **Authentication lifecycle** — register, verify, login/logout, recovery/reset, session rotation/revocation, enumeration resistance, rate limiting and trusted-origin enforcement.
6. **Organizer/event lifecycle** — onboarding, create/resume/edit draft, estate vs yard sale rules, schedule, deletion/cancel/removal states, optimistic/revision behavior.
7. **Media/upload pipeline** — upload authorization, sanitization, processing/readiness, reordering/removal/cover, cleanup, failure recovery, private/public object boundaries.
8. **Location/privacy/map** — server-mediated Geoapify, structured Bakersfield location, PostGIS storage, exact/approximate/hidden projections, public search/map leakage risk.
9. **Review/approval invariants** — exact preview, terms, revision-bound approval, material edit invalidation, stale approval/payment blocking.
10. **Payments/publication** — hosted Checkout, server price, test/live isolation, signed webhook, idempotent exactly-once publication, reconciliation and duplicate/delayed delivery.
11. **Public marketplace** — search/list/map parity, listing cards/detail routes, metadata/structured data, expired/canceled/removed behavior, imported-listing isolation.
12. **Jobs/cron/observability** — queue semantics, retries/leases, cron cadence requirements, health route, Sentry/Pino redaction, failure visibility.
13. **Email** — transactional sending, verification/recovery, templates/render/sanitize, receipt jobs, campaigns/contact sync, webhook handling and admin email editor.
14. **Super Admin security/current scope** — single super-admin access, recent-auth requirements, users, listings, payments, marketing contacts, moderation, imports isolation.
15. **Tests/CI** — current command truth, credential-free vs guarded Development Neon coverage, E2E gaps, test isolation and cleanup.
16. **Responsive/accessibility/perceived performance** — only after functional/security blockers are identified; audit current implementations instead of redesigning during Phase A/B.

## Delivery roadmap

### Phase A — Stabilize merged `main`

Goal: one secure, deterministic, green baseline before feature completion.

Suggested order:

1. Resolve the Vercel Hobby/native-cron plan decision so Production deploys can be meaningfully tested.
2. Upgrade Next.js/matching Next tooling to the patched supported version; update lockfile deliberately.
3. Rerun production dependency audit and remediate remaining HIGH/CRITICAL issues with the smallest compatible changes.
4. Apply mechanical Prettier fixes to the known files.
5. Run credential-free verification and fix actual regressions without weakening gates.
6. Human configures the four guarded Development Neon GitHub Actions secrets; verify endpoint identities remain distinct.
7. Run DB check, migrations in isolated Development test schema, integration, and Playwright E2E.
8. Run the full `pnpm verify` workflow locally/CI as designed.
9. Verify the Production build under the correct Production-beta environment without leaking secret values.
10. Deploy the intended `main` commit to Vercel Production beta and require `READY` plus `/api/health` HTTP 200 before proceeding.

Phase A exit gate: no unresolved P0 blocker and all required current-main verification evidence is PASS rather than inferred or BLOCKED.

### Phase B — Complete the core application

Audit and finish the actual end-to-end journey rather than page-by-page feature accumulation:

```text
Visitor
  -> registration/authentication
  -> email verification at the intended publish/payment gate
  -> organizer onboarding
  -> create/resume sale draft
  -> details and schedule
  -> structured Bakersfield location + privacy
  -> photo upload/process/reorder/cover
  -> exact preview + terms + approval
  -> material-edit invalidation/reapproval
  -> Stripe-hosted Checkout
  -> signed webhook/reconciliation
  -> exactly-once publication
  -> public search/list/map/detail
  -> organizer dashboard/edit/cancel lifecycle
```

Include invalid/expired/unauthorized/provider-failure paths. Prefer fixing missing transitions/invariants over adding new surface area.

### Phase C — STOP: UI + Super Admin + Email inventory

Do not immediately implement more super-admin features.

At this checkpoint, inventory what is already in the merged application and review it with the user using `KEEP / REFINE / REMOVE / DEFER`.

Review at minimum:

**Public/authenticated UI**

- landing/navigation
- Explore/search/list/map
- listing cards/detail
- event builder/preview
- organizer dashboard
- mobile and desktop behavior

**Super Admin**

- overview
- user search/detail
- listings/detail/moderation
- payments/purchase analytics
- marketing contacts/export
- email center/templates/campaign tools
- merged Imports UI and whether it should remain hidden/dormant for launch

**Email**

- verification
- password recovery/reset
- organizer/payment/publication transactional messages
- HTML template editor
- preview/responsive preview
- sanitization/versioning/publish flow
- receipts
- campaigns/contact sync

Only after user approval should Codex create the Phase D admin implementation plan.

### Phase D — Super Admin completion

Finish only the approved launch scope after Phase C. Keep the system simple and oriented toward one super-admin operator rather than inventing a role-management platform.

### Phase E — Production Beta acceptance

Use `docs/operations/production-beta-verification.md`. Require hosted evidence for health, auth, builder, locations/privacy, media, approval, Stripe test Checkout/webhook, publication, public UI, maps, jobs/email, admin, and accessibility.

### Phase F — Public launch

Separate reviewed change. Confirm business price/currency, live Stripe configuration, legal/refund posture, indexing/sitemap/SEO, monitoring, backups/recovery, and operational readiness before disabling beta/noindex protections.

### Phase G — Future scraper

After the core site is launched, create a fresh scraper implementation branch from the then-current `main` only if the user still wants automatic source ingestion. Reuse the merged ingestion contract rather than resurrecting old divergent assumptions.

## Initial audit output format

Codex should return a report shaped roughly like this:

```text
# Current release verdict
GO / NO-GO / BLOCKED

# Confirmed baseline
- current main SHA
- toolchain
- environment model
- commands actually run

# P0 launch blockers
1. Finding
   Evidence: file:line / command
   Impact:
   Smallest safe fix:
   Acceptance:

# P1 core-completion gaps
...

# P2 hardening / non-blocking improvements
...

# Deferred
- automatic web scraper/crawler
- nonessential admin/marketing expansion
...

# Proposed implementation sequence
1. ...
2. ...

# Human/provider actions required
- exact action, but never secret values

# Test matrix
- command -> expected outcome

# Stop point
Stop after the plan and wait for approval before changing code.
```

## Useful verification commands

Codex must inspect the current scripts before relying on these, but the present repository exposes:

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm arch:check
pnpm typecheck
pnpm prisma:validate
pnpm audit:prod
pnpm test:unit
pnpm test:contract:blob
pnpm test:contract:email
pnpm test:contract:location
pnpm test:contract:image
pnpm test:contract:stripe
pnpm verify:credential-free
pnpm db:test:check
pnpm test:integration
pnpm test:e2e
pnpm verify
pnpm build
```

Database-backed commands must remain inside the repository's Development Neon safety wrappers. Do not substitute a Production connection or broad reset.

## Known unknowns Codex must verify rather than assume

- the exact current Vercel failure after the cron-plan issue is resolved
- whether all Production-beta environment variables/resource markers are still correctly configured
- whether Production Neon has every merged migration applied or has pending drift
- whether the merged listing-import migration affects core queries/performance when no imports exist
- whether every queued job genuinely needs minute cadence, and acceptable maximum latency for each job type
- whether the latest Next/security upgrade introduces build/runtime behavior changes
- how the current UI differs from older design/acceptance documentation
- which super-admin/email features are already complete versus visually present but incomplete
- whether public lifecycle behavior for completed/expired/canceled sales is fully implemented
- whether the current hosted beta still satisfies all privacy/noindex/provider-isolation requirements

When evidence conflicts with older phase acceptance reports, treat the current code and current verification output as authoritative and document the conflict.
