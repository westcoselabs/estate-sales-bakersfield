# Live Provider Verification

Live-provider checks are separate from deterministic local and CI
verification. The active hosted acceptance workflow is the stable
[Production-beta checklist](./production-beta-verification.md), not a Vercel
Preview deployment.

## Retired legacy command

`pnpm verify:live` has been removed. It depended on isolated Preview resources,
which are prohibited by the main-only Production-beta release policy.

Historical reports may still mention it, but it is `NOT APPLICABLE` to current
acceptance. Do not restore it or create Preview deployments, providers, or
webhooks to reproduce old evidence. Use `pnpm verify` with guarded Development
Neon schemas, followed by the stable hosted checklist below.

## Current verification layers

### Local and CI

Run `pnpm verify` before promotion. Use logical `APP_ENV=test` with a guarded,
disposable schema inside Development Neon for database integration and
Playwright. Fake and capture adapters are expected in normal automated tests;
no Production provider call is required to pass.

### Stable Production beta

After an approved fast-forward of `main`, wait for the Vercel Production
deployment to become `READY`, then run bounded, non-destructive checks against
`https://estate-sales-bakersfield.vercel.app`.

Verify:

- `/api/health` returns HTTP 200;
- the beta remains `noindex` and sensitive routes remain
  `noindex,nofollow`;
- authentication, organizer, private-media, approval, Stripe test Checkout,
  webhook publication, and jobs use existing Production-beta resources;
- the existing webhook delivers to the stable Production endpoint;
- public routes, mobile layouts, keyboard focus, safe areas, and logs are
  healthy; and
- unavailable credentials or providers are `BLOCKED`, never silently passed.

Confirm variables and resource scopes without printing values. Do not rotate
credentials, create uncontrolled provider fixtures, or use Preview resources
as a fallback.

## Provider-specific boundaries

- **Neon:** inspect migration status and PostGIS without broad cleanup. Apply
  only approved checked-in migrations; stop on drift.
- **Authentication email:** use a controlled recipient. Retain
  enumeration-resistant responses and never log an address or token.
- **Private Blob:** use controlled objects and verify access remains private.
  Do not enumerate or delete unrelated objects.
- **Stripe:** use the existing test/sandbox Product, Price, key, and stable
  endpoint webhook. The browser redirect is not publication authority.
- **Jobs and limits:** invoke only the authenticated Production job endpoint
  according to its existing schedule and retain sanitized aggregate counts.
- **Location:** verify server-mediated Geoapify autocomplete, controlled admin
  resolution, MapLibre/OpenFreeMap maps, PostGIS persistence, visible
  attribution, and privacy-safe public zones. Never print queries, addresses,
  coordinates, identifiers, or keys.

## Result semantics

Record each hosted check as `PASS`, `FAIL`, or `BLOCKED`, with sanitized
evidence and the deployed commit/deployment ID. Any required `FAIL` or
`BLOCKED` result stops acceptance. It does not pass because a local fake
adapter test succeeded.
