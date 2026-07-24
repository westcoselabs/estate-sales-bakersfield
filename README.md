# Estate & Yard Sale Directory

This repository is a strict-TypeScript Next.js App Router modular monolith for
building and publishing Bakersfield estate- and yard-sale listings. The
application includes custom email/password authentication, opaque database
sessions, organizer onboarding, private event drafts, location validation,
sanitized media, exact previews, revision-bound approval, Stripe-hosted test
Checkout, webhook-authoritative publication, and public listing routes.

The public site is currently a stable, noindex Production beta. That beta is
the project's only hosted review environment.

## Active branch and environment workflow

- Local implementation work is performed on `main`.
- `main` is the only branch allowed to deploy automatically to the stable
  Vercel Production beta.
- Local development and automated tests must use local or isolated Test
  resources. They must not use Production data or credentials.
- Do not create Vercel Preview deployments, Preview-specific provider
  resources, or Preview webhooks.

The source still recognizes `APP_ENV=preview` and legacy Preview resource
markers. Those paths are retained for compatibility and historical evidence;
they are not an approved deployment workflow. See
[Application environments](./docs/operations/environments.md).

The project has no Docker, Testcontainers, or local-PostgreSQL prerequisite.

## Install and verify

Use the Node and pnpm versions pinned in `package.json`, `.node-version`, and
`.nvmrc`.

```text
pnpm install --frozen-lockfile
pnpm verify
```

`pnpm verify:credential-free` runs the deterministic local/CI subset.
`pnpm verify` adds guarded Test Neon integration and Playwright execution and
reports those checks as `BLOCKED` when the isolated Test configuration is
absent.

Credential-free checks always run. Database integration and Playwright checks
additionally require the guarded `.env.test.local` configuration described in
[Test Neon operations](./docs/operations/test-neon.md). Without it,
`pnpm verify` reports those checks as `BLOCKED`, runs the remaining
credential-free checks, and exits with status 2.

After local verification and explicit promotion approval, follow the
[Production-beta verification checklist](./docs/operations/production-beta-verification.md).
Missing credentials or unavailable providers are reported as `BLOCKED`, never
as passing. The repository's older Preview-only live-provider command is not
the active hosted workflow; its retained behavior is documented in
[Live-provider verification](./docs/operations/live-verification.md).

## Location and Explore providers

MapLibre GL JS renders organizer confirmation and public Explore maps.
OpenFreeMap supplies the launch map style and tiles. Geoapify supplies
server-mediated address autocomplete and controlled administrator geocoding.
Confirmed structured addresses and coordinates are stored permanently in
Neon/PostGIS.

The active architecture is documented in
[ADR 013](./docs/adr/013-maplibre-openfreemap-geoapify-location.md) and the
[location/Explore handoff](./docs/ui-ux/location-explore-handoff.md). The
earlier Mapbox and conditional Google decisions remain as historical ADRs.

## Architecture

Feature modules own domain policy, application ports/services, and
infrastructure adapters. Next.js routes compose module public interfaces.
Prisma and provider SDKs remain in infrastructure. Start with
[the architecture overview](./docs/architecture/overview.md) and
[Phase 3 event architecture](./docs/architecture/events.md).
