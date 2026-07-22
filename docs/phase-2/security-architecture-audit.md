# Independent Phase 2 Security and Architecture Audit

Date: 2026-07-21  
Auditor role: independent senior application-security and TypeScript/Next.js architecture review  
Scope: uncommitted Phase 1 inheritance plus Phase 2 account/organizer implementation  
Evidence state: findings below were recorded before implementation fixes were started.

## Baseline verdict

`NOT READY` at the pre-fix audit baseline. Four confirmed High findings affect authentication confidentiality, enumeration resistance, or session elevation. Four Medium findings affect trusted configuration, environment isolation, real-email safety, and the dependency/test acceptance gates. Provider configuration must wait until the High findings and provider-boundary Medium findings are corrected and credential-free verification is rerun.

## Critical

No confirmed Critical finding.

## High

### H-01 — Malformed stored password hashes create a login state oracle

1. **Exact evidence:** `src/modules/auth/application/workflow-service.ts:113-118` passes a stored hash directly to `PasswordHasher.verify`; `src/modules/auth/infrastructure/argon2-password-hasher.ts:22-34` throws `MalformedPasswordHashError` before Argon2 work; `src/app/api/auth/_shared.ts:47-105` has no generic-login mapping for that error. The error therefore falls through to the unexpected 500 response while unknown, incorrect, restricted, and disabled accounts return 401.
2. **Affected workflow:** login.
3. **Why it matters:** the response and timing distinguish a malformed credential record from all ordinary invalid-credential states, contradicting the documented enumeration-safe contract and omitting the dummy Argon2 work.
4. **Failure/attack scenario:** an attacker probes a target email. A 500 response instead of the generic 401 reveals that the normalized email resolved to a persisted account with an invalid/legacy/corrupted hash. Repeated requests can also turn one damaged row into a targeted availability failure.
5. **Recommended fix:** catch only `MalformedPasswordHashError` in the workflow, perform one comparison against the calibrated dummy hash, preserve the typed operational error, and map that type to the same 401 body as invalid credentials while logging only request ID, operation, and error type.
6. **Blocks provider configuration:** yes.
7. **Blocks Phase 2 acceptance:** yes.

### H-02 — Concurrent resend/reset issuance can enumerate existing accounts through a unique-index 500

1. **Exact evidence:** `src/modules/auth/infrastructure/prisma-account-repository.ts:144-182` and `:286-313` perform invalidate-then-create transactions without handling a concurrent partial-unique conflict. The database intentionally permits only one active token at `prisma/migrations/20260717000000_phase2_auth_and_organizers/migration.sql:26-32`. Resend/forgot routes mask only `RateLimitExceededError` at `src/app/api/auth/resend-verification/route.ts:44-54` and `src/app/api/auth/forgot-password/route.ts:45-55`; a Prisma P2002 becomes 500.
2. **Affected workflow:** verification resend and forgot-password token issuance.
3. **Why it matters:** database uniqueness correctly protects state, but the unhandled race makes the HTTP outcome account-dependent.
4. **Failure/attack scenario:** submit two allowed parallel requests for a target email. An unknown/disabled account returns two generic 202 responses. An eligible account can return one 202 plus one 500 when both transactions try to create the active token, revealing eligibility/existence.
5. **Recommended fix:** translate the expected active-token P2002 race to the same provider-neutral `null`/generic outcome and add real PostgreSQL concurrency tests for both workflows, including active-token and delivery-row counts.
6. **Blocks provider configuration:** yes.
7. **Blocks Phase 2 acceptance:** yes.

### H-03 — Email verification and session rotation commit in separate transactions

1. **Exact evidence:** `src/modules/auth/application/workflow-service.ts:149-158` commits token consumption and account verification through `AccountRepository.verifyEmail`, then `:160-169` independently reads and rotates the session through `SessionService`. `src/modules/auth/infrastructure/prisma-account-repository.ts:204-282` contains no session rotation in the verification transaction. This contradicts the atomic-rotation statement in `docs/architecture/authentication.md:19`.
2. **Affected workflow:** email verification and verified-session elevation.
3. **Why it matters:** verification changes account-wide authorization state. If the second transaction fails, the old session remains valid after it has gained verified capabilities.
4. **Failure/attack scenario:** a transient database error or uniqueness failure occurs after the verification transaction commits but before rotation deletes the old hash. A previously copied/fixed session token remains usable and now satisfies verified-user authorization.
5. **Recommended fix:** prepare the replacement token in application code, then atomically consume the verification token, set `emailVerifiedAt`, invalidate sibling tokens, replace the matching session hash, and write both audit events in one repository transaction. Add a database test that deliberately makes replacement creation fail and proves verification/token consumption roll back.
6. **Blocks provider configuration:** yes.
7. **Blocks Phase 2 acceptance:** yes.

### H-04 — Raw verification/reset tokens survive telemetry sanitization and same-origin referrers

1. **Exact evidence:** `src/platform/observability/sanitize.ts:1-17` redacts by property name only; token-bearing values under `request.url`, breadcrumb `href`, or another unexpected key survive. Both Sentry initializers use this function at `instrumentation-client.ts:12` and `src/platform/observability/sentry.server.ts:12`. A direct credential-free probe preserved a 43-character opaque token in all three shapes. `next.config.ts:22` uses `strict-origin-when-cross-origin`, which still sends the full URL as a same-origin referrer from `/verify-email?token=...` and `/reset-password?token=...`.
2. **Affected workflow:** verification/reset confirmation pages, client/server error reporting, and same-origin navigation/resource requests.
3. **Why it matters:** these query values are bearer credentials. Exposure to Sentry payloads, breadcrumbs, CDN/application access logs via `Referer`, or future same-origin analytics defeats hash-only persistence.
4. **Failure/attack scenario:** a client error occurs while a reset link is open; Sentry records `request.url` with the raw token. Alternatively the user follows the same-origin “request another link” navigation and the token URL is emitted as the referrer.
5. **Recommended fix:** sanitize sensitive query parameters in all string values, redact full opaque-token-shaped strings regardless of property name, and set `Referrer-Policy: no-referrer` specifically on verification/reset pages. Add regression tests for URL, breadcrumb, and unexpected-key shapes plus header coverage.
6. **Blocks provider configuration:** yes, because provider configuration enables real token-bearing email links.
7. **Blocks Phase 2 acceptance:** yes.

## Medium

### M-01 — Deployed application origins are only syntactically validated and Preview can fall back

1. **Exact evidence:** `src/platform/config/env.ts:20` accepts any URL-shaped `APP_URL`; a probe accepted `http://attacker.example/path?source=staging` for staging. `src/platform/config/application-url.ts:8-15` falls back to that value when Preview `VERCEL_URL` is absent or malformed. Authentication links are constructed from this URL at `src/modules/auth/application/workflow-service.ts:41-45`.
2. **Affected workflow:** trusted-origin enforcement and all verification/reset links.
3. **Why it matters:** a deployed misconfiguration can create cleartext or wrong-environment bearer links, and the implementation does not fail closed when the Preview host selector is unavailable.
4. **Failure/attack scenario:** Preview inherits a Production `APP_URL` and lacks a valid `VERCEL_URL`; Preview Resend messages contain Production links whose token hashes exist only in Preview. A staging HTTP URL can also expose tokens before reaching the application.
5. **Recommended fix:** require HTTP(S), origin-only URLs; require HTTPS in preview/staging/production; reject credentials, path, query, and fragment; and make Preview fail closed without a valid Vercel host.
6. **Blocks provider configuration:** yes.
7. **Blocks Phase 2 acceptance:** yes.

### M-02 — The former Redis key names omitted the required environment namespace

1. **Historical evidence:** the Redis adapter reviewed in the audited revision built `auth:v1:<workflow>:<fingerprint>` without `APP_ENV`, and its composition root did not pass an environment prefix. The current architecture has replaced that adapter with environment-scoped PostgreSQL buckets under amended ADR 006.
2. **Affected workflow:** distributed authentication rate limiting.
3. **Why it matters:** separate resources are the primary boundary, but an accidental credential/database reuse makes Preview/staging counters collide with Production rather than remaining namespaced.
4. **Failure/attack scenario:** Preview is mistakenly configured with the Production Redis endpoint during verification. Preview test traffic consumes Production login/registration counters and can deny real users across all Vercel instances.
5. **Recommended fix:** require a validated environment identifier in the adapter and include it in every Redis key; assert the exact key in contract tests.
6. **Blocks provider configuration:** yes.
7. **Blocks Phase 2 acceptance:** yes.

### M-03 — Local/test configuration can select the real Resend adapter

1. **Exact evidence:** `src/modules/auth/infrastructure/configured-auth.ts:39-50` prefers file capture only when a path exists, otherwise selects Resend whenever its pair is present, regardless of `APP_ENV`. `src/platform/config/env.ts:78-84` confines capture to test but does not prohibit real Resend in local/test.
2. **Affected workflow:** development and automated authentication email.
3. **Why it matters:** a developer or test process that inherits Resend credentials but omits the capture path can send real verification/reset email, contrary to the documented safety boundary.
4. **Failure/attack scenario:** CI or a local shell has Preview Resend credentials in its environment and runs an HTTP authentication test with `APP_ENV=test` but no capture path; the configured workflow calls Resend with fixture recipients and valid raw links.
5. **Recommended fix:** allow file capture only in local/test and select Resend only in preview/staging/production; fail closed when the appropriate adapter is absent. Keep capture files inside the ignored `.tmp` tree.
6. **Blocks provider configuration:** no; it blocks safe test/development operation.
7. **Blocks Phase 2 acceptance:** yes.

### M-04 — The production dependency audit now fails on a newly published advisory

1. **Exact evidence:** `package.json:91-93` and `pnpm-lock.yaml:8,452-455` force `@hono/node-server` 1.19.13. On 2026-07-21, `pnpm audit:prod` reports [GHSA-frvp-7c67-39w9](https://github.com/advisories/GHSA-frvp-7c67-39w9) (moderate, Windows encoded-backslash path traversal; patched in 2.0.5). `pnpm why --prod` traces it through `@prisma/client -> prisma -> @prisma/dev`. The application has no Hono import or Hono static-serving route, so direct Phase 2 runtime reachability was not found, but the frozen audit gate fails.
2. **Affected workflow:** dependency/CI acceptance and Prisma tooling dependency graph.
3. **Why it matters:** the acceptance report’s PASS was true before the advisory entered the database but is no longer reproducible. A failing moderate-threshold audit cannot be reported as PASS.
4. **Failure/attack scenario:** without a correction, every fresh CI run stops at `audit:prod`; if the transitive Hono server were used on Windows, protected static subtree files could be read through an encoded backslash path.
5. **Recommended fix:** advance the narrow override to at least 2.0.5, then rerun Prisma generation/validation, build, unit/contracts, and the audit. Do not claim application exploitability without a reachable Hono server.
6. **Blocks provider configuration:** no.
7. **Blocks Phase 2 acceptance:** yes.

### M-05 — Authored tests overclaim database and ownership assurance

1. **Exact evidence:** the Docker-blocked restricted-login test writes only `status: "RESTRICTED"` at `tests/integration/phase2-authentication.test.ts:246-249`, but the inherited check constraint at `prisma/migrations/20260716000000_phase1_foundation/migration.sql:19-22` requires `restricted_at`; the test would fail before login. The organizer test title claims cross-user mutation resistance at `tests/integration/phase2-authentication.test.ts:258`, but `:281-305` only creates and counts separate profiles. The suite also lacks real-transaction cases for verification-rotation rollback, concurrent resend/reset issuance, provider-failure delivery state, and expired/replaced token state assertions.
2. **Affected workflow:** Phase 2 database and E2E acceptance evidence.
3. **Why it matters:** authored-but-unexecuted tests are not verification; one known test is invalid and another assertion does not prove its title.
4. **Failure/attack scenario:** CI gains Docker and immediately fails on the fixture constraint, or passes the organizer count assertions despite a future transport bug that accepts an attacker-supplied owner identifier.
5. **Recommended fix:** repair the restriction fixture, exercise malicious owner/profile identifiers through the real schema/service boundary, add database regression cases for every security fix, and keep all Docker-dependent results `BLOCKED` until actually executed.
6. **Blocks provider configuration:** no.
7. **Blocks Phase 2 acceptance:** yes.

## Low

### L-01 — Generated request IDs can diverge between route work and error evidence

1. **Exact evidence:** routes create an ID with `requestIdFrom(request)` before work, while `authenticationApiError` calls `requestIdFrom(request)` again at `src/app/api/auth/_shared.ts:41`; when no trusted incoming ID exists, two UUIDs are generated.
2. **Affected workflow:** authentication error correlation.
3. **Why it matters:** an audit row created before a later failure can carry a different request ID from the returned/logged error.
4. **Failure/attack scenario:** session creation commits and cookie setting later fails; the session audit and client-visible error cannot be correlated by request ID.
5. **Recommended fix:** pass the route-scoped request ID to the mapper or cache it per Request.
6. **Blocks provider configuration:** no.
7. **Blocks Phase 2 acceptance:** no.

### L-02 — The final `.env*` ignore rule overrides the example-file exceptions

1. **Exact evidence:** `.gitignore:16-18` allows `.env.example`/`.env.test.example`, but `.gitignore:31` ignores `.env*` again; `.env.test.example` is deleted in the working tree.
2. **Affected workflow:** safe configuration documentation and future staging of example files.
3. **Why it matters:** the tracked `.env.example` remains visible only because it is already tracked, while a restored test template would be silently ignored.
4. **Failure/attack scenario:** a maintainer recreates `.env.test.example`, assumes it will be committed, and CI lacks the intended safe placeholders.
5. **Recommended fix:** remove the duplicate terminal rule or repeat the exceptions after it during a later repository-hygiene change; do not restore inherited files during this security fix unless ownership is confirmed.
6. **Blocks provider configuration:** no.
7. **Blocks Phase 2 acceptance:** no.

## Informational

### I-01 — Architecture boundaries and Phase scope are otherwise sound

- No current domain/application file imports Next.js, Prisma, Resend, Vercel Blob, or provider SDK types. Prisma and provider SDK usage is confined to infrastructure/platform composition. App Router handlers import the module facades, not generated Prisma or provider SDKs.
- Narrow account/session/organizer DTOs are returned. Organizer ownership is derived from the authenticated principal and repeated in repository `userId` selectors. Protected mutations enforce trusted origins below React.
- The Phase 1 migration has no Git diff. The Phase 2 migration is additive, uses real constraints/indexes, and the repository uses `prisma migrate deploy`; no `prisma db push` workflow was found.
- No Phase 3 event, address, media-ownership, payment, checkout, publication, search, map, or import implementation was found. The verified-publishing guard is a Phase 2 prerequisite only.

### I-02 — Failure-mode inventory

- Rate-limit database failure: fail closed with sanitized 503 for every protected authentication operation.
- Authentication email provider failure after token persistence: delivery fails open to the generic 202, marks the delivery failed, and leaves an active recoverable token/account state; resend/reset reissuance is the recovery path.
- Rate-limit rejection for signup/login/reset: explicit 429; resend/forgot rejection: intentionally masked as generic 202.
- Logout without a cookie or with an already-revoked cookie is idempotent; only the presented token hash is deleted.

### I-03 — Verification state at the pre-fix baseline

- PASS: Node 24.11.1, pnpm 10.33.2, format, lint, architecture check (127 modules/219 dependencies), typecheck, Prisma validation, unit 44/44, email contract 3/3, Blob contract 13/13, production build.
- FAIL: `pnpm audit:prod` — one moderate advisory (M-04).
- BLOCKED: PostgreSQL integration (19 authored, zero executed) and Playwright (4 authored, zero executed); Docker is not installed and Testcontainers reports no runtime strategy.
- BLOCKED and not accessed: live Preview rate-limit/Resend verification and controlled email delivery.
- Not rerun: previously reported live Preview Neon/Blob/Argon2 evidence; this audit did not require or access provider credentials.

## Planned fix disposition

- Fix automatically in Phase 2 scope: H-01 through H-04; M-01 through M-04; the concrete broken/false-positive portions of M-05; regression coverage for every security fix.
- Do not broad-refactor: L-01 and L-02.
- Do not configure providers, change Production, start Phase 3, rewrite the Phase 1 migration, or weaken blocked tests.

## Post-remediation disposition

Final code-review verdict: `READY FOR PROVIDER CONFIGURATION`. This is not Phase 2 acceptance: the remediated revision still needs a new non-Production Preview deployment, isolated Preview providers, a controlled delivery target/test mode, and actual execution of all Docker-dependent tests.

| Finding | Disposition                                             | Post-remediation evidence                                                                                                                                                                                                                                                                      |
| ------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H-01    | Resolved                                                | Login catches only `MalformedPasswordHashError`, performs dummy Argon2 work, emits sanitized operational evidence, and returns the generic invalid-credentials contract.                                                                                                                       |
| H-02    | Resolved in code; database regression execution blocked | Expected active-token `P2002` races are translated to a generic no-op result; concurrent verification/reset issuance tests assert one active token, but require Docker to execute.                                                                                                             |
| H-03    | Resolved in code; database regression execution blocked | Verification, token consumption, sibling invalidation, session replacement, and both audit events now share one Prisma transaction; a forced replacement-conflict rollback test is authored.                                                                                                   |
| H-04    | Resolved                                                | Sanitization covers sensitive URL parameters and token-shaped opaque string values, while token-bearing pages receive `Referrer-Policy: no-referrer`.                                                                                                                                          |
| M-01    | Resolved                                                | Application URLs must be origin-only HTTP(S); deployed origins require HTTPS; Preview derives only from a validated `*.vercel.app` host and has no `APP_URL` fallback.                                                                                                                         |
| M-02    | Superseded and resolved                                 | PostgreSQL bucket keys include the validated environment, hashed Test scope, workflow namespace, and a SHA-256 hash of the HMAC subject/network fingerprint.                                                                                                                                   |
| M-03    | Resolved                                                | Local/test are capture-only with capture paths confined to `.tmp`; deployed environments cannot select capture and local/test cannot select Resend.                                                                                                                                            |
| M-04    | Resolved                                                | The override advances `@hono/node-server` to patched 2.0.5; Prisma generation/validation, build, and `pnpm audit:prod` pass.                                                                                                                                                                   |
| M-05    | Resolved in authored coverage; execution blocked        | The invalid restricted fixture and ownership false-positive were corrected; real-transaction race, rollback, provider-failure recovery, and expired/replaced-state cases plus unit/config regressions were added. None of the 23 PostgreSQL or 4 Playwright tests was executed without Docker. |
| L-01    | Open, non-blocking                                      | Deferred as a low-risk correlation-quality refactor.                                                                                                                                                                                                                                           |
| L-02    | Open, non-blocking                                      | Deferred because the overlapping ignore-file changes are inherited and the tracked example remains available.                                                                                                                                                                                  |

No Critical finding was identified. No confirmed High or provider-boundary Medium finding remains open in the reviewed code.

## Final verification evidence

| Command                                                                                    | Final result                                                                                                      |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `node --version`; `pnpm --version`                                                         | Node 24.11.1; pnpm 10.33.2.                                                                                       |
| `pnpm format:check`                                                                        | PASS; all matched files use Prettier formatting.                                                                  |
| `pnpm lint`                                                                                | PASS; zero warnings.                                                                                              |
| `pnpm arch:check`                                                                          | PASS; 131 modules and 228 dependencies, no boundary violations.                                                   |
| `pnpm typecheck`                                                                           | PASS.                                                                                                             |
| `pnpm prisma:validate`                                                                     | PASS; schema valid.                                                                                               |
| `pnpm audit:prod`                                                                          | PASS; no known vulnerabilities.                                                                                   |
| `pnpm test:unit`                                                                           | PASS; 53/53 in 19 files.                                                                                          |
| `pnpm test:contract:email`                                                                 | PASS; 3/3.                                                                                                        |
| `pnpm test:contract:blob`                                                                  | PASS; 13/13.                                                                                                      |
| `pnpm build`                                                                               | PASS; Next.js 16.2.10 compiled, type-checked, and generated 14 static pages plus all dynamic routes.              |
| `docker version`                                                                           | BLOCKED; `docker` is not installed or callable.                                                                   |
| `pnpm test:integration`                                                                    | BLOCKED before collection; Testcontainers reports no working runtime. 23 tests are authored and zero executed.    |
| `pnpm test:e2e`                                                                            | BLOCKED before execution; the web server refuses to start without Docker. 4 tests are authored and zero executed. |
| `pnpm verify`                                                                              | BLOCKED at the integration step after every preceding offline gate passed.                                        |
| `git diff --check`                                                                         | PASS.                                                                                                             |
| `git diff --exit-code -- prisma/migrations/20260716000000_phase1_foundation/migration.sql` | PASS; the Phase 1 migration is unchanged from `HEAD`.                                                             |

The previously reported live Preview Neon/PostGIS, Private Blob, and Argon2 checks were not rerun. No live-provider command was run, and no credential value was inspected or changed during this audit.

## Remaining blocked acceptance work

- Deploy this remediated, still-uncommitted revision to a new non-Production Preview.
- Apply the PostgreSQL rate-limit migration to isolated Preview Neon and configure Preview Resend without reusing Production credentials.
- Approve a controlled Preview recipient or provider test mode, then exercise delivery and full Preview authentication recovery paths.
- Execute all 23 PostgreSQL integration and 4 Playwright tests on a Docker-capable host or CI and retain their actual results.
- Complete administrator TOTP/recovery custody before public launch, as already required by the frozen roadmap.

The existing Preview URL contains the pre-audit revision and is not evidence for the fixes in this report. Production was not accessed, configured, deployed, or modified. Phase 3 was not started.
