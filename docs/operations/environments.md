# Application Environments

The source accepts `local`, `test`, `preview`, and `production` as logical
`APP_ENV` values, but the approved operating topology has exactly two database
resources: Development Neon and Production Neon.

| Logical mode | Approved use                         | Database and provider posture                                                                                            |
| ------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Local        | Unhosted manual development          | Development Neon; capture or fake providers by default; never inherit Production credentials                             |
| Test         | Automated integration and Playwright | Generated per-run schemas inside Development Neon; capture email, fixture media/location, deterministic Stripe           |
| Preview      | Legacy parser compatibility only     | No deployment, database, providers, credentials, webhook, or importer target                                             |
| Production   | The only hosted beta                 | Production-scoped Neon/PostGIS, Blob, email, Geoapify, OpenFreeMap, and the existing Stripe test-mode beta configuration |

Only `main` deploys automatically to Vercel Production. Work locally on
`main`, run the complete verification suite, and push without force. Do not
use a Vercel Preview as an intermediate review environment.

## Current environment validation

The checked-in validator requires `DATABASE_RESOURCE_ENV=development` for
Local and Test database access and `DATABASE_RESOURCE_ENV=production` for the
hosted application. It also recognizes
`BLOB_RESOURCE_ENV`, `RESEND_RESOURCE_ENV`, and `STRIPE_RESOURCE_ENV`. A
marker is a guard against accidental scope mixing, not cryptographic proof of
the vendor resource; operators must still verify resource identity without
printing values.

`APP_ENV=preview` and its resource-marker rules remain in source for legacy
compatibility. Their presence does not authorize a Preview deployment. Do not
delete or relax those guards as an operations-only cleanup.

Test commands load the confirmed Development database identity from ignored
`.env.local` and an optional `.env.test.local` override based on
`.env.test.example`, switch only the logical process mode to `APP_ENV=test`, derive a
`codex_test_...` schema URL, replay migrations into that schema, and drop only
that exact schema afterward. The wrapper uses the configured Development URL
only as a lifecycle principal: it creates an expiring, per-run restricted login
that owns one generated schema, and only that login reaches migrations and test
children. The lifecycle URL is removed from the child environment. Common real
provider credentials are stripped.
`TEST_RUN_ID` is accepted only in `APP_ENV=test` and produces a hashed
PostgreSQL rate-limit scope; it is not an authentication bypass.

Normal `pnpm dev` and local `pnpm build` are guarded entry points: they require
`.env.local`, reject a database or credential that matches the ignored
Production configuration, and prevent `.env` fallback. Application
`APP_ENV=production` additionally requires `VERCEL_ENV=production`, which
Vercel supplies only to the Production deployment.

## Stable Production beta

The hosted beta requires `APP_ENV=production` and the server-only
`PRODUCTION_BETA_MODE=true`. That combination requires Stripe test mode and
rejects live credentials. It changes credential validation only: Production
beta still uses Stripe-hosted Checkout, signed webhook fulfillment, and
Production resource markers. Deterministic Checkout and test-control routes
remain limited to Local and Test.

Use the existing Production-beta Stripe test/sandbox webhook and environment
variables. Do not create, rotate, or replace provider credentials as part of a
UI or documentation milestone. The webhook secret remains scoped to the
stable Production endpoint; a legacy Preview secret is not a fallback.

The browser never submits a listing amount. `STRIPE_PRICE_ID`,
`STRIPE_EXPECTED_AMOUNT` in minor units, and `STRIPE_EXPECTED_CURRENCY` are
server-only and must match the approved Stripe test Price. Local and Test may
display `$12.34` only as a marked fixture, not as a business decision.

The Production beta remains `noindex`. Removing the beta flag, enabling live
Stripe, advertising a sitemap, or enabling public indexing requires a
separate reviewed launch.

## Location and map configuration

Production requires:

```text
GEOAPIFY_API_KEY=<private server-only value>
NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
```

The Geoapify key must never appear in HTML, RSC data, browser bundles, logs,
errors, screenshots, or snapshots. The map-style URL is deliberately public.
Do not add Google variables. Deterministic Test configuration omits Geoapify
and uses `https://map-style.test.invalid/fixture`, which performs no map
provider request.
