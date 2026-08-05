# Phase 2 Authentication and Organizer Architecture

## Boundaries

Authentication remains a custom feature module. Domain and application code define narrow account, session, token, email, privacy-fingerprint, and rate-limit types. Infrastructure adapters own Prisma, Next.js cookies, Argon2id, and Resend SDK usage. App Router routes parse HTTP input, apply trusted-origin checks, invoke application services, set or clear cookies, and map typed failures to sanitized responses.

`src/modules/organizers` is a separate feature module. It receives only the authenticated principal ID and organizer input; ownership is never accepted from the client.

## Registration and login

Registration validates display name, a normalized lowercase email, and an unmodified 12–128-character password. Password confirmation exists only at the request boundary. One transaction creates the user, hashed verification token, pending delivery record, and `ACCOUNT_CREATED` audit entry. The database unique index on `normalized_email` resolves simultaneous registration races. Existing and newly accepted addresses receive the same generic HTTP response.

Login performs one calibrated Argon2id comparison for both existing and unknown accounts by using a dummy hash. Valid active accounts receive a new opaque session; no pre-authentication session is reused. The route returns the same credential failure for unknown, incorrect, restricted, disabled, and malformed-hash account states. A malformed stored hash first triggers dummy Argon2 work, then produces sanitized request-correlated operational evidence without changing the generic client response.

## Email verification

Verification and reset tokens use at least 32 random bytes, base64url encoding, and SHA-256-only persistence. A 24-hour verification token is sent in an application-owned `/verify-email?token=...` link. The GET page only asks for confirmation; POST performs the state change so link scanners cannot consume the token.

The repository atomically consumes one active, unexpired token, sets `emailVerifiedAt`, invalidates other active tokens, rotates a matching current session, and audits both state changes. A failure during replacement-session creation rolls back verification and token consumption. A known expired, consumed, replaced, or unavailable token receives a generic response and a reason-coded audit entry without the token. Concurrent resend/reset issuance conflicts are mapped back to generic outcomes while the partial unique indexes preserve one active token.

Resend invalidates the previous active token and issues a new one only for an unverified, non-disabled account. The response is generic for every account state and for rate-limit rejection.

## Password recovery

Forgot-password always returns the same response. Eligible accounts receive a one-hour reset token after previous active reset tokens are invalidated. Reset hashes the request token before lookup, validates and hashes the new password, consumes the token, invalidates sibling tokens, updates the password, deletes every session, and writes password/session audit entries in one transaction. Concurrent consumers can produce only one successful reset.

## Sessions and authorization

Ordinary sessions contain seven-day absolute expiration and never slide.
Super-admin sessions contain eight-hour absolute expiration and track the last
password authentication time. Owner reauthentication rotates the opaque token,
updates that timestamp, and preserves the original expiration. Raw tokens exist
only in the request cookie and session grant; PostgreSQL stores SHA-256 hashes.
Production cookies are host-only, HTTP-only, Secure,
`SameSite=Lax`, path `/`, and use the `__Host-` prefix.

The central server functions are `getCurrentSession`, `getCurrentUser`, `requireUser`, `requireAdmin`, and `requireVerifiedPublishingUser`. They return a narrow principal and reject disabled or restricted accounts. Organizer commands derive ownership from `requireUser` and repeat ownership enforcement in the repository key. The verified-publishing guard exists for Phase 3 commands but no publishing workflow is implemented in Phase 2.

## Email delivery

`EmailService` is provider-neutral. The Resend adapter renders verification and reset messages and returns only an application-owned provider-message ID. Delivery records retain status, attempts, a keyed recipient fingerprint, and bounded provider/error identifiers; they do not retain message bodies or raw tokens. Local/test environments can use only a `.tmp` file-capture adapter and never select Resend; Production never selects capture.

Application links come from validated server configuration. Production uses its validated application origin and cannot fall back to a local or legacy Preview origin.

## Abuse controls

`AuthenticationAbuseControl` applies route-specific network and subject limits to registration, login, verification resend, forgot password, and reset. Identifiers are HMAC-SHA-256 fingerprints created with an environment-specific secret. The PostgreSQL adapter hashes that fingerprint again with the validated environment, test scope, and workflow namespace, then performs an atomic fixed-window upsert in `authentication_rate_limit_buckets`. The shared Neon database enforces the same counters across Vercel instances. Database failure is fail-closed and returns a sanitized temporary-unavailability response.

No process-memory rate limiter is composed in any environment. A Test run receives a hashed per-run scope so active counters are deterministic and isolated without bypassing PostgreSQL. The authenticated job runner removes expired buckets from its environment-specific Neon database. Ordinary denied requests, unknown accounts, and incorrect passwords are logs/metrics concerns and do not create one immutable audit row each.

## Organizer onboarding

An authenticated, active user may create or continue one organizer profile even before email verification, as required by the frozen roadmap. Empty optional fields produce `INCOMPLETE`; display name, contact name, and contact email produce `COMPLETE`. Contact email is normalized; free text is trimmed only where the schema explicitly permits it. A database unique key on `user_id` enforces one profile per account. DTOs omit the owning user ID and all Prisma records.

## Security invariants

- Cookie-authenticated mutations require a trusted same-origin request.
- Redirect targets must be relative same-origin application paths.
- Auth pages and responses are non-cacheable.
- Passwords, cookies, authorization headers, and raw tokens are redacted from logs and error reporting.
- Token-shaped telemetry values and sensitive URL query parameters are redacted even under unexpected field names; verification/reset pages use `Referrer-Policy: no-referrer`.
- Raw email is omitted from rate-limit keys and provider/audit metadata where unnecessary.
- Expected failures are typed; unexpected failures receive a request ID and sanitized log.
- No client storage, analytics event, or test-only HTTP endpoint contains authentication tokens.
