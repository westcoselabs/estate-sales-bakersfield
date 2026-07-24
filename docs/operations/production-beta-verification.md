# Production-Beta Verification

Use this checklist only after the complete local suite passes and an approved
commit is fast-forwarded to `main`. The stable Vercel Production deployment is
the project's only hosted beta.

## Safety gate

1. Confirm the intended commit passed `pnpm verify` on
   `feature/ui-ux-overhaul`.
2. Confirm promotion to `main` is a fast-forward requiring neither a force
   push nor a merge commit.
3. Confirm `vercel.json` permits automatic Git deployment only for `main`.
4. Confirm the target is exactly
   `https://estate-sales-bakersfield.vercel.app` and no Vercel Preview or
   Preview provider was created.
5. Confirm `APP_ENV=production`, `PRODUCTION_BETA_MODE=true`, and required
   `production` markers without printing values.
6. Confirm the existing Stripe test/sandbox webhook targets the stable
   Production `/api/webhooks/stripe` endpoint. Do not create or rotate it.
7. Confirm the beta remains noindex and no sitemap is advertised.
8. Stop on pending migrations, drift, an unexpected commit, unavailable
   provider, or ambiguous resource scope.

## Deployment and health

- Wait for the Vercel Production deployment to become `READY`.
- Record the deployed commit and deployment ID.
- Require `/api/health` to return HTTP 200.
- Review Production build, function, edge, and provider logs without exposing
  secrets, email addresses, tokens, full addresses, coordinates, Place IDs, or
  payment identifiers.
- Treat an unexpected warning or error burst as a failed check.

## Indexing and security

- Verify the Production beta emits `noindex`.
- Verify authentication, dashboard, builder, preview, payment, admin, test,
  and other sensitive routes emit `noindex,nofollow`.
- Confirm no public sitemap is advertised.
- Confirm safe redirects reject external origins.
- Confirm protected resources require the expected session and ownership.
- Confirm responses and logs do not disclose credentials or private data.

## Authentication workflow

Using an approved controlled email recipient:

1. Register and receive verification instructions.
2. Verify the scanner-safe flow, then log in and persist the session.
3. Confirm registration, login, and recovery remain enumeration resistant.
4. Complete organizer onboarding, then log out and log in again.
5. Request recovery, reset the password, verify prior-session revocation,
   reject the old password, and accept the new password.
6. Exercise invalid, expired/used, rate-limited, and provider-unavailable
   states without printing identifiers or tokens.

Invoke the authenticated job endpoint according to its existing Production
schedule and retain only sanitized aggregate evidence.

## Organizer and publication workflow

Use only controlled beta data:

1. Create and resume a draft; save details and schedule.
2. Validate a Bakersfield address through the deployed location provider and
   verify exact, approximate, and hidden privacy behavior.
3. Upload and sanitize controlled photos; select, reorder, and remove them;
   select a ready cover.
4. Compare preview and publication, accept terms, approve, edit material
   content, verify invalidation, then preview and reapprove.
5. Verify a different account cannot read or mutate the event.
6. Confirm the price matches existing approved server-side Stripe test
   configuration.
7. Complete Stripe-hosted test Checkout and confirm the return page cannot
   publish by itself.
8. Confirm the existing webhook publishes exactly once and the canonical
   listing preserves media, metadata, structured data, and address privacy.
9. Exercise cancel, duplicate delivery, delayed reconciliation, and stale
   revision blocking without a new provider resource or real charge.

Do not enumerate or broadly delete Production records or Blob objects. Remove
only explicitly controlled beta fixtures when cleanup is authorized.

## Public UI and accessibility

Check public and authenticated routes at 360, 390, 430, 768, 1280, and
dashboard 1440px widths:

- no horizontal overflow;
- safe-area-aware fixed or sticky controls;
- keyboard access in logical order;
- visible focus and focus return;
- usable error summary and first-invalid-field focus;
- reduced-motion behavior;
- readable loading, empty, success, warning, and failure states; and
- no content hidden behind navigation or bottom actions.

Capture deterministic screenshots without private or credential-bearing data.

## Location and map expectation

Test the deployed commit's actual behavior. Mapbox server-side forward
geocoding remains current until the separately approved Google migration.

Google Maps is not live merely because external variables may exist. Before
the transition, do not expect Google scripts, Places Autocomplete, Advanced
Markers, or tiles. Preserve intentional `MAP_PROJECTION_UNAVAILABLE` behavior
and ensure list results remain usable.

After the legal, storage, schema, credential, CSP, privacy, and cost gates pass
and a later implementation is approved, extend this checklist with Places
selection and pin confirmation, public-zone markers, expiring coordinates,
list-view network isolation, provider failures, attribution, redaction,
anti-triangulation, and rate-limit checks.

## Result and stop condition

Record every required item as `PASS`, `FAIL`, or `BLOCKED` with sanitized
evidence. `PASS` requires hosted behavior; `BLOCKED` is not a pass.

Stop after reporting the deployed commit, deployment ID, health result,
hosted checks, screenshots, logs reviewed, and accessibility findings. Do not
begin another milestone, enable indexing, switch to live Stripe, or begin the
Google Maps implementation.
