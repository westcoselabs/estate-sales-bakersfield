# Phase 2 Authentication and Organizer Acceptance Report

Date: 2026-07-21  
Scope status: Phase 2 implementation and the independent security/architecture audit remediation are complete; Phase 3 not started.  
Acceptance status: all available credential-free checks pass; Docker-dependent database/E2E execution, deployment of the remediated revision to a new Preview, and live Preview Upstash/Resend workflows are `BLOCKED`.

## Worktree provenance

Phase 2 began on a dirty worktree. The existing changes to `.env.example`, deletion of `.env.test.example`, `.gitignore`, `.vercelignore`, the authentication ADR, live-verification documentation/report/scripts, the Argon2 adapter, and its unit test were preserved as the Phase 1 live-verification baseline. Phase 2 necessarily extends some of those same files but does not revert or relabel the inherited edits. No commit, push, merge, or Production deployment was performed.

## Implemented workflows

- Enumeration-safe registration with display name, normalized unique email, 12–128-character password policy, Argon2id hashing, transactional verification-token/delivery/audit creation, and race-safe conflict handling.
- Login with a calibrated dummy hash for unknown accounts, active-account enforcement, a new opaque database session, and secure cookie issuance.
- Scanner-safe email verification through a confirmation GET followed by transactional POST consumption, 24-hour expiry, active-token invalidation, and matching-session rotation.
- Generic verification resend with token replacement and network/subject abuse limits.
- Generic forgot-password and one-hour, single-use password reset with transactional all-session revocation.
- Current-session logout, session listing, individual owned-session revocation, and revoke-all.
- Authenticated account/dashboard state, restricted-account handling, verified-publishing guard, and administrator-only guard/page.
- One user-owned organizer profile with `INCOMPLETE`/`COMPLETE` onboarding state and resumable updates.
- Resend and Upstash implementations behind provider-neutral application ports, plus credential-free test adapters.

No event creation, listing management, event media workflow, payments, search, maps, imported inventory, public directory page, or other Phase 3+ feature was added.

## Schema and migration

Migration: `20260717000000_phase2_auth_and_organizers`

Changes:

- `users.display_name` with a bounded database check.
- `invalidated_at` on verification and reset tokens.
- Partial unique indexes permitting only one active verification token and one active reset token per user.
- `organizer_status` and one-to-one `organizer_profiles` with ownership, length, status-completeness, foreign-key, and uniqueness constraints.
- `email_delivery_kind`, `email_delivery_status`, and `email_deliveries` with keyed recipient fingerprints, bounded provider/error identifiers, status-consistency checks, and access indexes.

The Phase 1 migration was not edited. `prisma db push` was not used. Preview Neon reports both migrations applied and no pending migration.

## Routes and pages

| Method       | Route                           | Purpose                                        |
| ------------ | ------------------------------- | ---------------------------------------------- |
| `POST`       | `/api/auth/signup`              | Generic registration acceptance                |
| `POST`       | `/api/auth/login`               | Login and session-cookie issuance              |
| `POST`       | `/api/auth/logout`              | Idempotent current-session logout              |
| `POST`       | `/api/auth/verify-email`        | Transactional verification consumption         |
| `POST`       | `/api/auth/resend-verification` | Generic verification resend                    |
| `POST`       | `/api/auth/forgot-password`     | Generic recovery request                       |
| `POST`       | `/api/auth/reset-password`      | Password reset and all-session revocation      |
| `GET`        | `/api/auth/sessions`            | List the current user's active sessions        |
| `DELETE`     | `/api/auth/sessions/[id]`       | Revoke one owned session                       |
| `POST`       | `/api/auth/sessions/revoke-all` | Revoke every owned session                     |
| `GET`        | `/api/account`                  | Narrow authenticated account projection        |
| `GET`, `PUT` | `/api/organizer`                | Read/save the current user's organizer profile |

Pages: `/signup`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password`, `/dashboard`, `/dashboard/organizer`, and the guard-only `/admin`.

## Security controls

- Four-iteration, 64 MiB Argon2id policy preserved.
- At least 32-byte base64url opaque tokens; only SHA-256 hashes persisted.
- Seven-day absolute sessions with no sliding extension.
- Preview/staging/Production use a host-only, HTTP-only, Secure, `SameSite=Lax`, path `/`, `__Host-` cookie.
- Verification and reset tokens are hashed, expiring, replaceable, and atomically single-use.
- Email verification and matching-session rotation now commit in one database transaction.
- Password reset revokes all sessions in the same database transaction.
- Network and subject limits use HMAC-fingerprinted identifiers; no raw password/token is stored in the limiter.
- Upstash is the deployed distributed authority, keys include the validated environment namespace, and protected workflows fail closed; the in-memory adapter refuses non-test use.
- Trusted-origin checks protect cookie-authenticated mutations; redirects accept only safe application-relative paths.
- Sensitive pages and APIs are no-store; token-bearing pages send `Referrer-Policy: no-referrer`.
- Provider SDKs and Prisma remain confined to infrastructure.
- Logs/Sentry redact authorization, cookies, passwords, token-like opaque values and URLs, and email fields; routine failed-login/rate-limit noise is not written to immutable audit history.
- Local/test email is capture-only and cannot select Resend; deployed environments cannot select the capture adapter.
- Preview application origins come only from validated HTTPS Vercel deployment hosts.
- Expected failures are typed; unexpected failures receive a request ID and sanitized log. Malformed JSON was specifically verified to return a safe 400.

## Test totals

| Category                        | Authored | Executed | Result                                 |
| ------------------------------- | -------: | -------: | -------------------------------------- |
| Unit                            |       53 |       53 | PASS                                   |
| Credential-free email contract  |        3 |        3 | PASS                                   |
| Credential-free Blob contract   |       13 |       13 | PASS                                   |
| PostgreSQL/PostGIS integration  |       23 |        0 | BLOCKED — no Docker-compatible runtime |
| Playwright production-build E2E |        4 |        0 | BLOCKED — no Docker-compatible runtime |
| Live Private Blob               |        1 |        1 | PASS                                   |

The eleven Phase 2 integration cases cover transactional registration/duplicate race, recoverable provider-delivery failure, concurrent verification/reset-token issuance, verification rotation and repeated rejection, concurrent verification consumption, atomic verification rollback, replaced/expired token state, resend invalidation, concurrent reset/all-session revocation, restricted login, and organizer ownership. The four Playwright cases cover the full account/recovery/session/organizer lifecycle, anonymous denial, cache/cookie/trusted-origin controls, and token-page referrer policy. They are present but are not claimed as executed.

## Command evidence

| Check                      | Result  | Evidence                                                                                                                    |
| -------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`        | PASS    | All tracked files match Prettier.                                                                                           |
| `pnpm lint`                | PASS    | ESLint completed with zero warnings.                                                                                        |
| `pnpm arch:check`          | PASS    | 131 modules and 228 dependencies; no boundary violations.                                                                   |
| `pnpm typecheck`           | PASS    | Strict TypeScript completed without errors.                                                                                 |
| `pnpm prisma:validate`     | PASS    | Prisma schema valid.                                                                                                        |
| `pnpm audit:prod`          | PASS    | The newly published transitive Hono advisory was remediated at patched `@hono/node-server` 2.0.5; no known vulnerabilities. |
| `pnpm test:unit`           | PASS    | 53 tests in 19 files.                                                                                                       |
| `pnpm test:contract:email` | PASS    | 3 tests; message construction, app links, SDK isolation/error mapping, capture behavior.                                    |
| `pnpm test:contract:blob`  | PASS    | 13 Phase 1 contracts preserved.                                                                                             |
| `pnpm test:integration`    | BLOCKED | Testcontainers could not find a Docker-compatible runtime; no test was reported as passing.                                 |
| `pnpm build`               | PASS    | Next.js production build compiled, type-checked, and generated all Phase 2 routes.                                          |
| `pnpm test:e2e`            | BLOCKED | The production web server correctly refused to start without its disposable PostGIS container.                              |
| `pnpm verify`              | BLOCKED | Every check through unit/email/Blob contracts passed; aggregate stopped at the Docker-dependent integration prerequisite.   |
| `pnpm verify:live`         | PASS    | Preview Neon migration/schema/rollback, Vercel Argon2id, and Private Blob lifecycle all passed.                             |

## Preview verification

- Pre-audit Preview deployment: `dpl_9vjmDCf312D87EauScvYZxKqJ2fv`
- Deployment URL: `https://estate-sales-bakersfield-fxz9pb6ew-westcoselabs-projects.vercel.app`
- `VERCEL_BENCHMARK_URL` was updated for Preview only to the final immutable deployment.
- Effective checks confirmed `APP_ENV=preview`, `CRON_SECRET` configured, and the final benchmark selector without printing secret values.
- The Phase 2 migration was deployed only to the established Preview Neon database.
- Preview Neon: PostGIS `3.6.0`, migration/transaction rollback `PASS`, Phase 2 schema write/rollback `PASS`.
- Vercel runtime: Node `24.18.0`; Argon2id p50 `237.43 ms`, p95 `313.17 ms`.
- Preview Private Blob complete lifecycle: `PASS`; generated fixture removed.
- `/api/health`: 200; `/signup`: 200.
- Malformed signup JSON: sanitized 400.
- Structurally valid signup: fail-closed 503 because isolated Preview Upstash and Resend resources are not configured. No account was created and no email was sent.
- Live Upstash persistence/expiry and controlled Resend delivery: `BLOCKED`.
- The audit remediation has not been deployed; a new Preview deployment is required before repeating live authentication verification.

No Vercel Production environment, Production deployment, Production Neon branch, Production Blob store, Production Upstash resource, or Production Resend credential was accessed or modified.

## Deviations and known limitations

1. The frozen roadmap does not prescribe exact organizer fields. Phase 2 uses the minimum bounded identity/contact profile needed for resumable onboarding: display name, contact name, contact email, optional phone, and optional website. One profile per user is enforced in PostgreSQL.
2. The prompt requests rate-limit persistence/expiry coverage under the PostgreSQL integration heading, while the frozen provider prerequisites select Upstash. Persistence/expiry is therefore covered by deterministic adapter tests and remains live-Preview `BLOCKED`; no duplicate PostgreSQL rate-limit authority was added.
3. Docker unavailability blocks clean-database migration replay, database race execution, and Playwright execution on this host. Preview migration and transaction-safe Phase 2 schema writes pass, but they do not replace the blocked clean-database suites.
4. Vercel selects the configured Node major and currently built with a newer Node 24 patch than the repository pin. The application build and calibrated Argon2id envelope pass in that runtime.
5. Administrator TOTP remains required before public launch and is intentionally deferred by the frozen roadmap. No administrator mutation workflow was introduced.

## Remaining risks and prerequisites

- Configure an isolated Preview Upstash database and Preview Resend sender/key before claiming live authentication success.
- Approve a controlled Preview email recipient or provider test mode before any live send.
- Deploy the remediated revision to a new non-Production Preview before repeating live checks.
- Run all 23 integration and 4 Playwright tests on a Docker-capable host or pull-request CI.
- Verify and retain the Resend sending-domain records before public launch.
- Complete administrator TOTP and recovery custody before public launch.

## Completion gate

The code, schema, migration, routes, security boundaries, tests, audit remediation, and documentation required for Phase 2 are implemented. The code is ready for isolated Preview provider configuration, but the overall Phase 2 acceptance gate remains `BLOCKED`, not `PASS`, until the remediated revision is deployed to a new Preview and the Docker-dependent suites and Preview Upstash/Resend workflow run successfully. No confirmed code failure remains, Production was not accessed, and Phase 3 was not started.
