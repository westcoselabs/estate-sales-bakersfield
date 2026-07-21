# Estate & Yard Sale Directory

Phase 2 account and organizer foundation for the Bakersfield estate and yard sale directory. This repository is a strict-TypeScript Next.js App Router modular monolith backed by PostgreSQL/PostGIS and Prisma migrations.

The current scope includes custom email/password authentication, opaque database sessions, verification and reset workflows, distributed authentication rate limits, and user-owned organizer onboarding. It intentionally contains no event tables, media records, payment logic, search, maps, imported inventory, or public directory pages.

## Local prerequisites

- Node and pnpm versions declared in `package.json`, `.node-version`, and `.nvmrc`.
- Docker-compatible container runtime for the credential-free PostgreSQL/PostGIS integration suite.
- No provider credentials are required for `pnpm verify`.

Install and verify:

```text
pnpm install --frozen-lockfile
pnpm verify
```

`pnpm verify` runs formatting, linting, module-boundary checks, strict type checking, Prisma validation, a production dependency audit, unit tests, credential-free Blob and email contracts, Testcontainers/PostGIS integration tests, a production build, and Playwright tests.

Phase 2 uses Resend and Upstash Redis through application-owned ports. Their credentials are required for deployed authentication workflows, but never for unit or contract tests. See [Phase 2 testing](./docs/phase-2/testing.md) for environment placeholders and blocked-result semantics.

## Live provider verification

`pnpm verify:live` is separate and must target isolated non-production resources. It runs migrations and a rollback/schema check on Neon, an Argon2 benchmark on a non-production Vercel deployment when configured, and the complete Vercel Private Blob lifecycle. Phase 2 Resend and Upstash runtime checks require their own Preview credentials. Missing credentials are reported as `BLOCKED`; they are never reported as passing.

See `docs/operations/live-verification.md` for safety and credential requirements.

## Repository status

The workspace is initialized as a local Git repository on `main`. A private GitHub remote is intentionally not invented; connect one only after its owner, organization, name, and authorization are supplied or approved.
