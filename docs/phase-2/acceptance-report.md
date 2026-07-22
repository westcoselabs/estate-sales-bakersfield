# Phase 2 Authentication and Organizer Acceptance Report

Date updated: 2026-07-21

Implementation/audit status: **PASS — PostgreSQL rate-limit simplification implemented in the working tree**
Acceptance status: **BLOCKED only on isolated Test Neon execution and live Preview prerequisites**

## Implemented baseline

Phase 2 provides enumeration-safe registration and recovery, Argon2id login with dummy work, opaque seven-day database sessions, scanner-safe verification, atomic reset/session revocation, trusted-origin protection, environment-namespaced PostgreSQL limits, provider-neutral Resend email, redacted operational evidence, and one user-owned resumable organizer profile. The provider-neutral rate-limit port is unchanged; the current infrastructure uses Neon in all four application environments and has no process-memory fallback.

Migrations `20260716000000_phase1_foundation`, `20260717000000_phase2_auth_and_organizers`, and `20260721000000_phase3_event_builder` remain unchanged. The architecture simplification adds `20260722000000_postgresql_auth_rate_limits`. `prisma db push` is not a deployment workflow.

## No-Docker closeout

The active integration and Playwright infrastructure now targets the persistent isolated Test Neon branch. Commands require `APP_ENV=test`, `TEST_DATABASE_URL`, `TEST_DIRECT_URL`, a matching endpoint ID, and the exact Test confirmation marker. They reject Preview/Production mode, known non-Test URLs, endpoint mismatches, missing TLS, and pooled/direct identity mismatches. Runs use unique IDs and clean only run-owned users and durable jobs. The separate broad reset command additionally requires `TEST_DATABASE_RESET_CONFIRMATION=reset-estate-sales-bakersfield-isolated-test-neon`.

The Test runner strips real Resend, Blob, Mapbox, Vercel OIDC, and Vercel environment credentials. Playwright uses capture email, Test Neon rate limits with a hashed per-run scope, deterministic location fixtures, and `.tmp` media. There is no Docker, Testcontainers, local PostgreSQL, process-memory rate-limit authority, or authentication bypass.

## Current evidence

| Check                           | Status  | Evidence                                                                   |
| ------------------------------- | ------- | -------------------------------------------------------------------------- |
| Unit regression                 | PASS    | 85/85, including PostgreSQL limiter policy/failure/migration coverage      |
| Email contracts                 | PASS    | 3/3                                                                        |
| Blob contracts                  | PASS    | 14/14; Phase 2/Phase 1 behavior preserved                                  |
| Test Neon Phase 1–3 integration | BLOCKED | 31 authored; guard rejected this host before collection                    |
| Playwright production-build E2E | BLOCKED | Same Test Neon prerequisite; no test claimed as executed                   |
| Preview PostgreSQL rate limits  | NOT RUN | New migration and cross-instance/cleanup checks require a Preview revision |
| Preview Resend                  | BLOCKED | Credentials plus approved recipient/provider test mode unavailable         |
| New Preview workflow            | BLOCKED | Provider configuration and safe Preview migration/deployment not performed |
| Production dependency audit     | PASS    | No known vulnerabilities after narrow advisory-patched overrides           |

Previously reported live Preview Neon/PostGIS/schema/transaction, Private Blob, and Argon2id benchmark evidence remains historical baseline evidence. It is not relabeled as evidence for the new revision.

## Remaining manual actions

1. Set `APP_ENV=test` and provide the isolated persistent Test Neon pooled/direct credentials and endpoint ID in `.env.test.local`, then run `pnpm db:test:check`, `pnpm test:integration`, and `pnpm test:e2e`.
2. Configure isolated Preview Resend with its Preview scope marker and approve a controlled recipient or provider test mode.
3. Apply the new migration only to Preview Neon, create an explicit non-Production Vercel Preview deployment, and execute the documented Phase 2 workflow including cross-instance rate limits and cleanup.
4. Confirm the authenticated maintenance endpoint runs at least hourly in the deployed environment.
5. Complete administrator TOTP before public launch.

Production was not accessed while performing this closeout.
