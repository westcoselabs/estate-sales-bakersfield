# Application Environments

The source accepts exactly four `APP_ENV` values: `local`, `test`, `preview`,
and `production`. That compatibility model is broader than the approved
operating topology.

| Environment | Current approved use                 | Database and provider posture                                                                                            |
| ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Local       | Unhosted manual development          | Non-Production data; capture or fake providers by default; never inherit Production credentials                          |
| Test        | Automated integration and Playwright | Persistent isolated Test Neon, scoped PostgreSQL limits, capture email, fixture media/location, deterministic Stripe     |
| Preview     | Legacy compatibility only            | Do not deploy, provision Preview-specific providers, or create Preview webhooks                                          |
| Production  | The only hosted beta                 | Production-scoped Neon/PostGIS, Blob, email, Geoapify, OpenFreeMap, and the existing Stripe test-mode beta configuration |

Only `main` deploys automatically to Vercel Production. Work locally on
`main`, run the complete verification suite, and push without force. Do not
use a Vercel Preview as an intermediate review environment.

## Current environment validation

The checked-in validator recognizes `DATABASE_RESOURCE_ENV`,
`BLOB_RESOURCE_ENV`, `RESEND_RESOURCE_ENV`, and `STRIPE_RESOURCE_ENV`. A
marker must match the application environment
consuming the credential. The marker is a guard against accidental scope
mixing, not cryptographic proof of the vendor resource; operators must still
verify resource identity without printing values.

`APP_ENV=preview` and its resource-marker rules remain in source for legacy
compatibility. Their presence does not authorize a Preview deployment. Do not
delete or relax those guards as an operations-only cleanup.

Test commands load only `.env.test.local`, override runtime database URLs with
guarded Test URLs, and strip common real provider credentials. `TEST_RUN_ID`
is accepted only in `APP_ENV=test` and produces a hashed PostgreSQL rate-limit
scope; it is not an authentication bypass.

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
