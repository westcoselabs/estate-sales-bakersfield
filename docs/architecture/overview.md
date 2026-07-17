# Phase 1 Architecture

## Shape

The application is a greenfield modular monolith using Next.js App Router and strict TypeScript. Feature modules own their domain, application ports/policies, and infrastructure adapters. Routes remain composition and transport layers. Cross-cutting configuration, database, logging, error reporting, and request security live under `src/platform`.

```text
src/app                 HTTP and Next.js composition
src/modules/auth        Password, opaque token, session, cookie, and guard primitives
src/modules/jobs        Minimal PostgreSQL-backed durable work foundation
src/modules/media       Provider-neutral MediaStore plus one Vercel Blob adapter
src/platform            Environment, database, observability, and security plumbing
prisma                  Schema and immutable real migrations
tests                   Unit, integration, offline contract, live contract, and E2E
```

Dependency Cruiser enforces no circular dependencies, infrastructure-free domain/application layers, no module-to-App imports, and Vercel Blob SDK isolation. Prisma-generated code is excluded from source control and regenerated from the pinned schema/toolchain.

## Persistence

Phase 1 owns only users, sessions, hashed verification/reset tokens, immutable audit entries, and durable jobs. The first migration enables PostGIS but deliberately creates no organizer, event, event-photo, upload-reservation, payment, or search models. Preview/staging/production use Neon through the Prisma Neon adapter; local and Testcontainers use the Prisma PostgreSQL adapter.

Credential-free database integration uses `postgis/postgis:16-3.5-alpine`, whose upstream image matrix provides PostgreSQL 16 with PostGIS 3.5 and initializes PostGIS in the requested database. See the [docker-postgis project](https://github.com/postgis/docker-postgis).

## Security baseline

The baseline includes validated environment configuration, CSP and standard security headers, trusted-origin and constant-time bearer-secret helpers, Pino redaction, Sentry event sanitization, narrow auth principals, Argon2id, hashed opaque tokens, database expiry, revocation and rotation primitives, and append-only meaningful audit records. Transport endpoints for signup/login/verification/reset and distributed rate limiting belong to Phase 2.

## Hard stop

This foundation stops at primitives and provider contracts. Paid publication remains the product priority, but event drafting, real upload ownership, Stripe, publication, and public event pages begin only in their frozen later phases.
