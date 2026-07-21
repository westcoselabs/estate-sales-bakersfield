# ADR 001: Custom Opaque Database Sessions

Status: accepted, final for initial scope.

## Decision

Use custom email/password authentication primitives with Argon2id and cryptographically random opaque sessions. Only SHA-256 token hashes are stored in PostgreSQL. Sessions have database expiry, secure host-only cookie options, rotation, current logout, individual revocation, global revocation, narrow principal reads, and centralized user/admin guards. Verification/reset tokens are also random, hashed, expiring, single-use, and atomically consumed.

The Phase 1 Argon2id baseline is 64 MiB, four iterations, one lane, and a 32-byte output. The initial two-iteration policy measured only 114.35 ms p50 in the protected Vercel Preview runtime, below the 150 ms acceptance floor and the approximate 200–350 ms target. Four iterations preserve the 64 MiB memory floor and were revalidated at p50 205.16 ms and p95 229.26 ms in that runtime.

No Better Auth, Auth.js/NextAuth, social login, magic link, passkey, SMS, authentication SaaS, or alternate auth provider is introduced.

## Rationale

This adapts the proven opaque-token shape inspected in `txlocallist` while closing its lifecycle gaps. Database ownership is explicit, revocation is immediate, feature boundaries stay stable, and the security behavior is directly testable. The cost is custom-code responsibility, mitigated by a deliberately small module, modern hashing, transactional repositories, strict tests, and a narrow initial method set.

## Phase 2 implementation

Phase 2 composes the Phase 1 primitives into signup, login, verification/resend, password reset, current logout, session management, distributed abuse controls, and narrow authorization projections. Preview and Production use a Secure `__Host-estate_session` cookie; local and test use the non-Secure `estate_session` cookie so loopback tests remain possible. All sessions retain a seven-day absolute expiry with no sliding renewal.

Routine failed-login and rate-limit noise remains bounded telemetry, not immutable audit history. Verification rotates a matching authenticated session, password reset revokes every session, and restricted accounts cannot authenticate or pass user/admin guards.
