# Phase 1 Greenfield Foundation — Corrected Execution Plan

Status: frozen for implementation. Source roadmap: `C:/Users/citry/Downloads/PLAN (3).md`, SHA-256 `5C9312DEE5DFF17E8F0424BA1F9546CFE9573819A00FD1D604F8C0924193A5E0` as inspected on 2026-07-16.

Implementation outcome: see [acceptance-report.md](./acceptance-report.md).

## Deliverables

Repository/package configuration, strict TypeScript, feature module boundaries, environment validation, Neon/PostGIS and real Prisma migration workflow, CI, basic unit/integration/Playwright infrastructure, structured logging, baseline error tracking, security headers, minimal durable jobs/outbox, dependency compatibility validation, custom opaque-session auth primitives, and the provider-neutral Vercel Blob `MediaStore` contract.

## Corrected verification split

`pnpm test:contract:blob` is credential-free and covers the interface, application-owned I/O, Vercel SDK type isolation, path generation, adapter error mapping, and test-double behavior. `pnpm test:contract:blob:live` performs the complete isolated non-production Private Blob lifecycle. `pnpm verify` contains all credential-free checks for local/PR CI. `pnpm verify:live` contains external Neon migration/transaction checks, the Vercel runtime Argon2 benchmark when configured, and the live Blob lifecycle. Unavailable live credentials are `BLOCKED`, never `PASS`, and do not invalidate credential-free results.

## Domain-neutral Blob scope

Phase 1 uses opaque `{environment}/{resourceScope}/{reservationId}/{randomName}` keys generated from fixtures. The interface can receive future event-scoped authorization, but this phase creates no event, photo, upload-reservation, or media table and gives the adapter no domain database dependency.

## Audit boundary

Immutable audit rows cover meaningful state changes. Routine incorrect passwords, unknown-account attempts, ordinary rate-limit blocks, and credential-stuffing noise belong in privacy-safe logs/metrics/rate-limit telemetry rather than one row per attempt.

## Repository initialization

Initialize the current empty workspace as a local Git repository. Create or connect a private GitHub remote only when the user has provided or approved the destination repository and the required authorization is available. Missing remote configuration does not block Phase 1.

## Exclusions and hard stop

Do not implement Phase 2 or later account endpoints/workflows, organizers, events, event photos, upload reservations, media processing, stable public media delivery, Stripe/payment/publication, search, editorial routes, admin products, or visual polish. Stop after the Phase 1 acceptance report.
