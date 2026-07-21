# Current Architecture Through Phase 3

## Shape

The application is a modular monolith using Next.js App Router and strict TypeScript. Feature modules own domain rules, application ports/services, and infrastructure adapters. Routes are transport/composition layers. Configuration, database creation, logging, error reporting, and trusted-origin enforcement live under `src/platform`.

```text
src/app                  Pages, route handlers, and HTTP composition
src/modules/auth         Accounts, opaque sessions, email, limits, and guards
src/modules/organizers   User-owned organizer onboarding
src/modules/events       Draft state, ownership, projections, and approval
src/modules/locations    Provider-neutral address validation
src/modules/media        Provider-neutral private objects and image processing
src/modules/jobs         PostgreSQL durable work foundation
src/platform             Configuration, database, observability, and security
prisma                   Immutable migrations and schema
tests                    Unit, Test Neon integration, contracts, live, and E2E
```

Dependency Cruiser enforces circular-dependency, layer, App-import, and provider-SDK boundaries. Prisma-generated code is not committed and is regenerated from the pinned toolchain.

## Persistence

Phase 1 owns users, sessions, hashed verification/reset tokens, append-only audit entries, durable jobs, and PostGIS. Phase 2 adds organizer profiles, delivery tracking, account display names, and token invalidation. Phase 3 adds organizer-owned events, separate private locations, event photos and upload reservations, approval history, and current approval proof.

Local manual development and Vercel Preview use Preview Neon where appropriate. Automated database and browser tests use only the persistent isolated Test Neon branch. Test runs use unique identifiers and delete only their own users/jobs; broad reset is a separate explicitly confirmed Test-only command.

## Security baseline

The baseline includes validated environment configuration, CSP and standard security headers, trusted-origin checks, Pino/Sentry redaction, narrow principals, Argon2id, hashed opaque tokens, transactional expiry/revocation/rotation, enumeration-safe responses, provider-neutral email/rate-limit/media/location ports, private address projections, owner/admin draft-media authorization, immutable processed media keys, optimistic event versions, append-only audit history, and deterministic revision approval digests.

## Scope boundary

The application stops after an organizer approves an exact pre-payment event revision. Stripe, checkout, webhooks, payment fulfillment, publication transitions, and automatic public visibility are not implemented.
