# Phase 2 Authentication and Organizer Acceptance Report

Date updated: 2026-07-21

Implementation/audit status: **PASS — accepted committed baseline**
No-Docker closeout status: **BLOCKED only on isolated Test Neon and live Preview prerequisites**

## Implemented baseline

Phase 2 provides enumeration-safe registration and recovery, Argon2id login with dummy work, opaque seven-day database sessions, scanner-safe verification, atomic reset/session revocation, trusted-origin protection, environment-namespaced Upstash limits, provider-neutral Resend email, redacted operational evidence, and one user-owned resumable organizer profile. The independent audit found no unresolved Critical or High issue; all confirmed High and Medium findings were remediated before this baseline.

Migration `20260717000000_phase2_auth_and_organizers` remains unchanged. Migration `20260716000000_phase1_foundation` also remains unchanged. `prisma db push` is not a deployment workflow.

## No-Docker closeout

The active integration and Playwright infrastructure now targets the persistent isolated Test Neon branch. Commands require `APP_ENV=test`, `TEST_DATABASE_URL`, `TEST_DIRECT_URL`, a matching endpoint ID, and the exact Test confirmation marker. They reject Preview/Production mode, known non-Test URLs, endpoint mismatches, missing TLS, and pooled/direct identity mismatches. Runs use unique IDs and clean only run-owned users and durable jobs. The separate broad reset command additionally requires `TEST_DATABASE_RESET_CONFIRMATION=reset-estate-sales-bakersfield-isolated-test-neon`.

The Test runner strips real Resend, Upstash, Blob, Mapbox, Vercel OIDC, and Vercel environment credentials. Playwright uses capture email, deterministic limits/location, and `.tmp` media. There is no Docker, Testcontainers, local PostgreSQL, or authentication bypass.

## Current evidence

| Check                           | Status  | Evidence                                                                   |
| ------------------------------- | ------- | -------------------------------------------------------------------------- |
| Unit regression                 | PASS    | Included in the current 74-test unit suite                                 |
| Email contracts                 | PASS    | 3/3                                                                        |
| Blob contracts                  | PASS    | 14/14; Phase 2/Phase 1 behavior preserved                                  |
| Test Neon Phase 1–3 integration | BLOCKED | `.env.test.local` has no isolated Test Neon credentials on this host       |
| Playwright production-build E2E | BLOCKED | Same Test Neon prerequisite; no test claimed as executed                   |
| Preview Upstash                 | BLOCKED | Isolated Preview resource/credentials unavailable                          |
| Preview Resend                  | BLOCKED | Credentials plus approved recipient/provider test mode unavailable         |
| New Preview workflow            | BLOCKED | Provider configuration and safe Preview migration/deployment not performed |

Previously reported live Preview Neon/PostGIS/schema/transaction, Private Blob, and Argon2id benchmark evidence remains historical baseline evidence. It is not relabeled as evidence for the new revision.

## Remaining manual actions

1. Create or provide the isolated persistent Test Neon pooled/direct credentials and endpoint ID in `.env.test.local`, then run `pnpm db:test:check`, `pnpm test:integration`, and `pnpm test:e2e`.
2. Configure isolated Preview Upstash and Resend resources with Preview scope markers.
3. Approve a controlled recipient or provider test mode.
4. Apply migrations only to Preview Neon, create an explicit non-Production Vercel Preview deployment, and execute the documented Phase 2 live workflow.
5. Complete administrator TOTP before public launch.

Production was not accessed while performing this closeout.
