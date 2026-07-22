# Estate & Yard Sale Directory

This repository is a strict-TypeScript Next.js App Router modular monolith for building Bakersfield estate- and yard-sale listings. Phase 2 provides custom email/password authentication, opaque database sessions, recovery, distributed rate limits, and organizer onboarding. Phase 3 adds private event drafts, validated locations, sanitized media, exact previews, terms, and revision-bound approval. Payment and publication remain out of scope.

## Environments

The application has exactly four environments: `local`, `test`, `preview`, and `production`.

- Local manual development may use the isolated Preview Neon branch.
- Automated integration and Playwright suites use only the persistent isolated Test Neon branch; authentication rate limits are real PostgreSQL buckets isolated by a hashed test-run scope.
- Preview uses isolated Preview Neon, Resend, Blob, and Mapbox resources.
- Production is reserved for the future public application and must not be used for development or verification.

The project has no Docker, Testcontainers, or local-PostgreSQL prerequisite.

## Install and verify

Use the Node and pnpm versions pinned in `package.json`, `.node-version`, and `.nvmrc`.

```text
pnpm install --frozen-lockfile
pnpm verify
```

`pnpm verify:credential-free` runs the deterministic local/CI subset. `pnpm verify` adds guarded Test Neon integration and Playwright execution and reports those checks as `BLOCKED` when the isolated Test configuration is absent.

Credential-free checks always run. Database integration and Playwright checks additionally require the guarded `.env.test.local` configuration described in [Test Neon operations](./docs/operations/test-neon.md). Without it, `pnpm verify` reports those checks as `BLOCKED`, runs the remaining credential-free checks, and exits with status 2.

Live verification is a separate, Preview-only operation. See [Preview verification](./docs/operations/preview-verification.md). Missing external credentials are reported as `BLOCKED`, never as passing.

## Architecture

Feature modules own domain policy, application ports/services, and infrastructure adapters. Next.js routes compose module public interfaces. Prisma and provider SDKs remain in infrastructure. Start with [the architecture overview](./docs/architecture/overview.md) and [Phase 3 event architecture](./docs/architecture/events.md).
