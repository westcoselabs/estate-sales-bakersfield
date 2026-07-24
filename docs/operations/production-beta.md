# Stable Production Beta Runbook

This runbook covers the stable Vercel Production deployment while Stripe
remains in test mode. It is the project's only hosted beta and is not
authorization for live Stripe, real charges, public indexing, or a Google Maps
migration.

## Deployment topology

- `main` is the only branch that deploys automatically.
- `feature/ui-ux-overhaul` is the ongoing local integration branch.
- Promote only by an explicitly approved fast-forward; never force-push or
  create a merge commit.
- Do not create Vercel Preview deployments, Preview-specific provider
  resources, or Preview webhooks.
- Keep the stable beta at
  `https://estate-sales-bakersfield.vercel.app` unless a domain change is
  separately approved.

## Required environment posture

- `APP_ENV=production`
- `PRODUCTION_BETA_MODE=true`
- `APP_URL` is the stable HTTPS Production origin
- Production Neon and private Blob credentials with matching `production`
  resource markers
- current Resend and Mapbox adapters with matching `production` markers
- the existing Stripe test key, Price, expected amount/currency,
  `STRIPE_MODE=test`, and `STRIPE_RESOURCE_ENV=production`
- the existing test-mode webhook secret scoped to the stable Production
  `/api/webhooks/stripe` endpoint
- independent Production `AUTH_FINGERPRINT_SECRET` and `CRON_SECRET`

Confirm variable names, scopes, and resource identities without displaying
values. Do not create, rotate, copy, or replace a credential during ordinary
promotion.

The browser does not receive the beta flag, Stripe secret, webhook secret,
database URL, Blob token, email credential, or server provider credential.
Stripe-hosted Checkout and the signed webhook remain authoritative; the
success redirect cannot publish.

## Migration gate

Load Production Neon variables without displaying them. Confirm the
`production` marker, run `pnpm prisma:validate`, then
`pnpm prisma migrate status`. Review every pending checked-in migration before
`pnpm prisma migrate deploy`. Stop on drift or ambiguity. Never use `db push`,
`migrate reset`, broad cleanup, or a replacement seed command.

## Promotion gate

1. Run the complete local suite on `feature/ui-ux-overhaul`.
2. Confirm the approved commit can fast-forward `main` and no accidental files
   are included.
3. Confirm `vercel.json` enables automatic Git deployment only for `main`.
4. Confirm Production-scoped variables exist without printing values and the
   existing Stripe test webhook targets the stable Production URL.
5. Review and apply only approved checked-in migrations.
6. Fast-forward `main`, push without force, and wait for the Vercel Production
   deployment to become `READY`.
7. Complete the
   [Production-beta verification checklist](./production-beta-verification.md).

Stop on a failed local check, unexpected ancestry, migration drift, missing
resource, deployment failure, provider failure, or credential mismatch. Do not
substitute a Preview deployment.

## Current and conditional location behavior

Mapbox server-side forward geocoding remains the current location runtime. The
application has no approved live Google browser map. Google Maps Platform is
conditionally accepted, but implementation remains blocked until written
provider or qualified legal confirmation covers directory use, data storage,
coordinate caching, PostGIS use, public markers, and attribution.

Do not add Google credentials through this runbook. Do not remove Mapbox or
expect `/search?view=map` to use Google before a separate migration is
approved, implemented, and verified. Hosted checks must test the deployed
commit's actual behavior, including an intentional map-unavailable state.

## Future live launch

Live launch is a separate reviewed change. It includes removing
`PRODUCTION_BETA_MODE`, replacing Stripe test resources with approved live
resources, setting `STRIPE_MODE=live`, enabling indexing only after the
SEO/content gate, and completing a dedicated launch runbook. Environment
validation intentionally rejects a partial or mismatched transition.
