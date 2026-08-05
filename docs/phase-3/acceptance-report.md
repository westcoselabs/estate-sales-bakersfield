# Phase 3 Acceptance Report

Date: 2026-07-21  
Implementation status: **historical Phase 3 record; superseded operationally**

> The blocked environment results below are retained as historical evidence,
> not as current prerequisites. Current database-bearing tests use disposable
> schemas inside Development Neon, and the only hosted target is Vercel
> Production with Production-scoped resources. Do not create a Preview or
> separate Test resource to reproduce this report.

## Implemented workflows

- Organizer-owned estate/yard-sale draft creation, partial saves, resumption, dashboard status, and optimistic multi-tab conflicts.
- Server-validated local schedule plus UTC instants and IANA timezone.
- Separate private normalized location with decimal/PostGIS coordinates and Exact, Approximate, and Hidden-until-start projections.
- Private signed upload reservation, actual decode, orientation handling, metadata-stripping WebP variants, verification, staging cleanup, ordering, cover selection, and deletion.
- Stable owner/admin draft-media proxy routes with no provider keys/URLs.
- Exact preview from the future public projector.
- Versioned terms and atomic, digest-bound exact revision approval with redacted audit evidence.
- Material-edit approval invalidation and historical approval retention.

Stripe, checkout, webhooks, payment fulfillment, publication, public draft visibility, and other Phase 4 transitions are absent.

## Migration

Phase 3 migration: `20260721000000_phase3_event_builder`. The architecture
simplification adds forward-only `20260722000000_postgresql_auth_rate_limits`;
Phase 1-3 migration files are unchanged. The old blocked Test/Preview statement
is superseded by the Development-schema test workflow.

## Historical results at the time of this report

| Check                                  | Status  | Result                                                                     |
| -------------------------------------- | ------- | -------------------------------------------------------------------------- |
| Format                                 | PASS    | Current source formatted                                                   |
| Lint                                   | PASS    | Zero warnings                                                              |
| Architecture                           | PASS    | No dependency violations at latest run                                     |
| Type check                             | PASS    | Strict TypeScript                                                          |
| Prisma validation/generation           | PASS    | Schema valid; client generated                                             |
| Unit                                   | PASS    | 85/85, including PostgreSQL authentication limiter coverage                |
| Email contract                         | PASS    | 3/3                                                                        |
| Blob/media contract                    | PASS    | 14/14                                                                      |
| Location contract                      | PASS    | 2/2                                                                        |
| Image contract                         | PASS    | 1/1                                                                        |
| Production dependency audit            | PASS    | No known vulnerabilities                                                   |
| Production build                       | PASS    | Next.js 16.2.10 built all Phase 2/3 routes                                 |
| Test Neon integration                  | BLOCKED | 31 tests authored; safety guard rejected this host before collection       |
| Empty Test Neon migration replay       | BLOCKED | Explicit reset credentials/confirmation unavailable                        |
| Playwright                             | BLOCKED | 5 tests authored; same Test Neon prerequisite                              |
| Preview deployment/migration           | BLOCKED | No safe provider configuration/deployment authorization state available    |
| Live Preview rate limits/Resend/Mapbox | BLOCKED | Preview migration/deployment, credentials, and controlled recipient absent |
| Live Preview Blob                      | NOT RUN | Historical Phase 2 result does not prove this revision                     |

## Commands executed

- `pnpm install --lockfile-only`: **PASS**.
- `pnpm prisma:generate` and `pnpm prisma:validate`: **PASS**.
- `pnpm verify:credential-free`: final **PASS** for format, lint, architecture, production build, type check, Prisma validation, dependency audit, 85 unit tests, and all four contract suites. An earlier run failed only at newly published dependency advisories; narrow overrides moved `fast-uri`, the Prisma Hono transitive, and Next's Sharp copy to patched versions before the successful rerun.
- `pnpm db:test:check`: **BLOCKED** with the intentional `Database tests require APP_ENV=test` safety error.
- `pnpm verify:live`: **NOT RUN**; no Preview or Production resource was accessed.
- `pnpm test:integration`: **BLOCKED before collection** by the same Test Neon safety prerequisite; none of the 31 authored tests is claimed as executed.
- `pnpm test:e2e`: **BLOCKED before browser execution** when the guarded Test Neon web server refused to start; none of the 5 authored tests is claimed as executed.
- `pnpm db:test:reset`, migration application, and live-provider contracts: **NOT RUN** because their isolated prerequisites are absent.

## Security and privacy controls

All event mutations use trusted-origin validation. Authentication, verification for media/preview/approval, active account state, completed organizer onboarding, ownership, and optimistic version are enforced below React. Authentication rate-limit identifiers are double-scoped SHA-256 values, fixed-window changes use atomic PostgreSQL upserts and database time, and every protected workflow fails closed on database errors. Exact location is absent from dashboard/audit/approximate/hidden DTOs. Provider credentials require environment markers. Automated tests strip real providers. Object keys and original uploads remain private. Approval stores a SHA-256 digest, not raw address evidence in audit metadata.

## Known limitations and human review

- Live provider result quality and organizer-supplied timezone association
  require a controlled Production-beta review; server syntax/DST validation is
  implemented.
- Browser and real-transaction assertions now run in disposable Development
  Neon schemas.
- HEIC/HEIF decode support depends on the deployed Sharp/libvips build and
  requires controlled Production-beta fixture verification.
- The current Git branch is `main`; no local Vercel metadata identifies the configured Production Branch. No deployment was attempted from this potentially protected branch.
- Human review should prioritize the new rate-limit migration/upsert/cleanup SQL, the Phase 3 migration/trigger SQL, event repository transactions, privacy projector/digest, private media route, and Test Neon guard.

Preview deployment identifier for this revision: **none**. Redacted provider identifiers: **none available**. The historical Phase 2 Preview is not claimed as evidence for these changes.

## Superseding current actions

Use Development Neon identity in ignored local test configuration, run the
guarded schema-based integration and browser suites, then use the stable
[Production-beta verification](../operations/production-beta-verification.md)
workflow for an approved hosted release. Preview and separate Test resources
are not permitted fallback targets.

Production was not accessed. Phase 4 and Stripe were not started. No commit, push, merge, or deployment was performed.
