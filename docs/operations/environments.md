# Application Environments

The source accepts exactly four `APP_ENV` values: `local`, `test`, `preview`,
and `production`. That compatibility model is broader than the approved
operating topology.

| Environment | Current approved use                 | Database and provider posture                                                                                               |
| ----------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Local       | Unhosted manual development          | Non-Production data; capture or fake providers by default; never inherit Production credentials                             |
| Test        | Automated integration and Playwright | Persistent isolated Test Neon, scoped PostgreSQL limits, capture email, fixture media/location, deterministic Stripe        |
| Preview     | Legacy compatibility only            | Do not deploy, provision Preview-specific providers, or create Preview webhooks                                             |
| Production  | The only hosted beta                 | Production-scoped Neon, Blob, email, current Mapbox location provider, and the existing Stripe test-mode beta configuration |

Only `main` deploys automatically to Vercel Production. Work on
`feature/ui-ux-overhaul` remains local until it passes the complete local
verification suite and is explicitly approved for a fast-forward promotion.
Do not force-push, create a merge commit, or use a Vercel Preview as an
intermediate review environment.

## Current environment validation

The checked-in validator still recognizes `DATABASE_RESOURCE_ENV`,
`BLOB_RESOURCE_ENV`, `RESEND_RESOURCE_ENV`, `MAPBOX_RESOURCE_ENV`, and
`STRIPE_RESOURCE_ENV`. A marker must match the application environment
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

## Conditional Google Maps transition

Mapbox server-side forward geocoding remains current runtime behavior. Google
Maps Platform is not live and its asserted public variables are not yet part
of the checked-in environment schema. Do not add Google credentials, print
values, remove Mapbox variables, or change provider resources until:

1. Written Google Maps Platform or qualified legal confirmation covers the
   estate-sale directory use case, selected Place data, coordinate caching,
   PostGIS use, public markers, and attribution.
2. The approved schema and migration define first-party address data,
   expiring provider evidence, and application-owned public zones.
3. The single browser key can be restricted to approved localhost and
   Production origins and only the approved APIs.
4. The Maps JavaScript Map ID supports Advanced Markers.
5. CSP, redaction, quotas, billing alerts, and failure behavior pass review.

Until then, do not treat `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` or
`NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` as evidence that Google Maps is enabled.
