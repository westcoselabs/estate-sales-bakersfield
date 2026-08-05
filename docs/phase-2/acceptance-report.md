# Phase 2 Authentication and Organizer Acceptance Report

Date updated: 2026-07-21

Implementation/audit status: **historical Phase 2 record; superseded operationally**

> The blocked environment instructions and counts originally recorded here are
> historical evidence, not current prerequisites. Current tests use disposable
> `codex_test_*` schemas inside Development Neon. The only hosted target is
> Vercel Production backed by Production Neon. Do not provision a separate Test
> database or any Preview deployment/provider to reproduce this report.

## Implemented baseline

Phase 2 provides enumeration-safe registration and recovery, Argon2id login
with dummy work, opaque seven-day database sessions, scanner-safe verification,
atomic reset/session revocation, trusted-origin protection,
environment-namespaced PostgreSQL limits, provider-neutral Resend email,
redacted operational evidence, and one user-owned resumable organizer profile.
The provider-neutral rate-limit port is unchanged; current Local/Test modes use
Development Neon and Production uses Production Neon, with no process-memory
fallback.

Migrations `20260716000000_phase1_foundation`, `20260717000000_phase2_auth_and_organizers`, and `20260721000000_phase3_event_builder` remain unchanged. The architecture simplification adds `20260722000000_postgresql_auth_rate_limits`. `prisma db push` is not a deployment workflow.

## No-Docker closeout

The current integration and Playwright infrastructure targets one generated
`codex_test_<timestamp>_<random>` schema per run inside Development Neon.
Commands take the Development pooled/direct URLs and endpoint identity from
ignored local configuration, reject Production identity and `public`, deploy
migrations into the generated schema, and drop only that validated schema.

The Test runner strips real Resend, Blob, location-provider, Vercel, and
Production credentials. Playwright uses capture email, Development Neon rate
limits with a hashed per-run scope, deterministic location fixtures, and
`.tmp` media. There is no Docker, Testcontainers, local PostgreSQL,
process-memory rate-limit authority, or authentication bypass.

## Historical evidence at the time of this report

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

## Superseding current actions

1. Configure ignored local test settings with Development Neon identity only.
2. Run `pnpm db:test:check`, `pnpm test:integration`, and `pnpm test:e2e`;
   each database-bearing command creates and removes its own guarded schema.
3. Before a reviewed Production release, apply checked-in migrations through
   the Production direct URL, deploy `main` to Vercel Production, and use the
   stable Production-beta verification checklist.
4. Never create a Preview or separate Test resource as a fallback for a failed
   check.

Production was not accessed while performing this closeout.
