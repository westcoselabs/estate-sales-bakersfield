# Current Architecture Through Phase 2

## Shape

The application is a greenfield modular monolith using Next.js App Router and strict TypeScript. Feature modules own their domain, application ports/policies, and infrastructure adapters. Routes remain composition and transport layers. Cross-cutting configuration, database, logging, error reporting, and request security live under `src/platform`.

```text
src/app                 HTTP and Next.js composition
src/modules/auth        Account workflows, opaque sessions, email, rate limits, and guards
src/modules/organizers  User-owned organizer onboarding
src/modules/jobs        Minimal PostgreSQL-backed durable work foundation
src/modules/media       Provider-neutral MediaStore plus one Vercel Blob adapter
src/platform            Environment, database, observability, and security plumbing
prisma                  Schema and immutable real migrations
tests                   Unit, integration, offline contract, live contract, and E2E
```

Dependency Cruiser enforces no circular dependencies, infrastructure-free domain/application layers, no module-to-App imports, and Vercel Blob SDK isolation. Prisma-generated code is excluded from source control and regenerated from the pinned schema/toolchain.

## Persistence

Phase 1 owns users, sessions, hashed verification/reset tokens, immutable audit entries, and durable jobs. Phase 2 adds organizer profiles, delivery tracking, account display names, and token invalidation state. There are still no event, event-photo, upload-reservation, payment, or search models. Preview/staging/production use Neon through the Prisma Neon adapter; local and Testcontainers use the Prisma PostgreSQL adapter.

Credential-free database integration uses `postgis/postgis:16-3.5-alpine`, whose upstream image matrix provides PostgreSQL 16 with PostGIS 3.5 and initializes PostGIS in the requested database. See the [docker-postgis project](https://github.com/postgis/docker-postgis).

## Security baseline

The baseline includes validated environment configuration, CSP and standard security headers, trusted-origin and constant-time bearer-secret helpers, Pino redaction, Sentry event sanitization, narrow auth principals, Argon2id, hashed opaque tokens, database expiry, revocation and rotation, enumeration-safe transport responses, Resend behind an email port, Upstash behind a rate-limit port, and append-only meaningful audit records.

## Hard stop

The repository stops after account and organizer onboarding. Paid publication remains the product priority, but event drafting, real upload ownership, Stripe, publication, and public event pages begin only in their frozen later phases.
