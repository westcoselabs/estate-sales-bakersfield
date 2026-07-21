# Phase 3 Acceptance Report

Date: 2026-07-21  
Implementation status: **COMPLETE through exact pre-payment revision approval**  
Acceptance status: **BLOCKED on Test Neon execution and live Preview prerequisites**

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

New forward-only migration: `20260721000000_phase3_event_builder`. Phase 1/2 migration files are unchanged. Static migration guarantees pass; Test/Preview application remains `BLOCKED` until the corresponding isolated credentials and safety gate are available.

## Current results

| Check                              | Status  | Result                                                                  |
| ---------------------------------- | ------- | ----------------------------------------------------------------------- |
| Format                             | PASS    | Current source formatted                                                |
| Lint                               | PASS    | Zero warnings                                                           |
| Architecture                       | PASS    | No dependency violations at latest run                                  |
| Type check                         | PASS    | Strict TypeScript                                                       |
| Prisma validation/generation       | PASS    | Schema valid; client generated                                          |
| Unit                               | PASS    | 74 authored/executed                                                    |
| Email contract                     | PASS    | 3/3                                                                     |
| Blob/media contract                | PASS    | 14/14                                                                   |
| Location contract                  | PASS    | 2/2                                                                     |
| Image contract                     | PASS    | 1/1                                                                     |
| Production dependency audit        | PASS    | No known vulnerabilities                                                |
| Production build                   | PASS    | Next.js 16.2.10 built all Phase 2/3 routes                              |
| Test Neon integration              | BLOCKED | 27 tests authored; isolated Test credentials absent                     |
| Empty Test Neon migration replay   | BLOCKED | Explicit reset credentials/confirmation unavailable                     |
| Playwright                         | BLOCKED | 5 tests authored; same Test Neon prerequisite                           |
| Preview deployment/migration       | BLOCKED | No safe provider configuration/deployment authorization state available |
| Live Preview Upstash/Resend/Mapbox | BLOCKED | Preview credentials/resources and controlled recipient absent           |
| Live Preview Blob                  | NOT RUN | Historical Phase 2 result does not prove this revision                  |

## Commands executed

- `pnpm install --lockfile-only`: **PASS**.
- `pnpm prisma:generate` and `pnpm prisma:validate`: **PASS**.
- `pnpm verify`: credential-free portion **PASS** (format, lint, architecture, build, type check, Prisma validation, dependency audit, 74 unit tests, and all four contract suites); aggregate result **BLOCKED** because the Test Neon guard rejected absent Test configuration before integration/Playwright execution.
- `pnpm db:test:check`: **BLOCKED** with the intentional `APP_ENV=test` safety error.
- `pnpm verify:live`: **BLOCKED** with the intentional Preview/database resource-scope safety error.
- `pnpm test:integration`, `pnpm test:e2e`, `pnpm db:test:reset`, migration application, and live-provider contracts: **NOT RUN** because their isolated prerequisites are absent.

## Security and privacy controls

All event mutations use trusted-origin validation. Authentication, verification for media/preview/approval, active account state, completed organizer onboarding, ownership, and optimistic version are enforced below React. Exact location is absent from dashboard/audit/approximate/hidden DTOs. Provider credentials require environment markers. Automated tests strip real providers. Object keys and original uploads remain private. Approval stores a SHA-256 digest, not raw address evidence in audit metadata.

## Known limitations and human review

- Mapbox live result quality, normalized address, and the organizer-supplied IANA timezone association require controlled Preview review; server syntax/DST validation is implemented.
- Browser and real-transaction assertions are authored but not claimed without Test Neon.
- HEIC/HEIF decode support depends on the deployed Sharp/libvips build and requires Preview fixture verification.
- The current Git branch is `main`; no local Vercel metadata identifies the configured Production Branch. No deployment was attempted from this potentially protected branch.
- Human review should prioritize the Phase 3 migration/trigger SQL, event repository transactions, privacy projector/digest, private media route, and Test Neon guard.

Preview deployment identifier for this revision: **none**. Redacted provider identifiers: **none available**. The historical Phase 2 Preview is not claimed as evidence for these changes.

## External actions required

Provide isolated Test Neon credentials; configure isolated Preview provider resources and scope markers; approve a controlled recipient/test mode; confirm a non-Production deployment path; apply migrations only to Preview; then execute [Preview verification](../operations/preview-verification.md).

Production was not accessed. Phase 4 and Stripe were not started. No commit, push, merge, or deployment was performed.
