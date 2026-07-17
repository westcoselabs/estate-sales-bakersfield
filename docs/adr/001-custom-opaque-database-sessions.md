# ADR 001: Custom Opaque Database Sessions

Status: accepted, final for initial scope.

## Decision

Use custom email/password authentication primitives with Argon2id and cryptographically random opaque sessions. Only SHA-256 token hashes are stored in PostgreSQL. Sessions have database expiry, secure host-only cookie options, rotation, current logout, individual revocation, global revocation, narrow principal reads, and centralized user/admin guards. Verification/reset tokens are also random, hashed, expiring, single-use, and atomically consumed.

The Phase 1 Argon2id baseline is 64 MiB, two iterations, one lane, and a 32-byte output. Local hash-only calibration was approximately 262 ms p50; the protected Vercel live benchmark must validate the actual deployment runtime before the provider-dependent acceptance item can pass.

No Better Auth, Auth.js/NextAuth, social login, magic link, passkey, SMS, authentication SaaS, or alternate auth provider is introduced.

## Rationale

This adapts the proven opaque-token shape inspected in `txlocallist` while closing its lifecycle gaps. Database ownership is explicit, revocation is immediate, feature boundaries stay stable, and the security behavior is directly testable. The cost is custom-code responsibility, mitigated by a deliberately small module, modern hashing, transactional repositories, strict tests, and a narrow initial method set.

## Phase boundary

Phase 1 implements password/token/session/cookie/guard primitives only. Signup/login/email workflows, distributed rate limiting, roles workflow, and organizer profile are Phase 2. Routine failed-login noise is telemetry, not immutable audit history.
