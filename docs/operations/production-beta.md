# Stable Production Beta Runbook

This runbook covers the stable Vercel Production deployment while Stripe
remains in test mode. It is the project's only hosted beta and is not
authorization for live Stripe, real charges, public indexing, or public launch.

## Deployment topology

- `main` is the only branch that deploys automatically.
- Work locally on `main`; never force-push.
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
- current Resend adapter with its matching `production` marker
- private `GEOAPIFY_API_KEY` and public
  `NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty`
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

## Scheduled work on Hobby

The checked-in Vercel schedules run `/api/internal/jobs/run` daily during the
09:00 UTC hour and `/api/internal/email-jobs/run` daily during the 10:00 UTC
hour. Vercel Hobby does not guarantee a precise minute within either hour.
Normal signed Stripe webhooks still fulfill immediately; the maintenance cron
is the fallback for missing/delayed webhook reconciliation and also processes
cleanup and media jobs. Queued receipts and contact synchronization may wait
roughly one day, and a queue larger than the worker's ten-job batch can carry
into later days. Treat sustained backlog as a stop condition and revisit the
scheduling plan before higher-volume launch.

## Migration gate

Load Production Neon variables without displaying them. Confirm the
`production` marker, run `pnpm prisma:validate`, then
`pnpm prisma migrate status`. Review every pending checked-in migration before
`pnpm prisma migrate deploy`. Stop on drift or ambiguity. Never use `db push`,
`migrate reset`, broad cleanup, or a replacement seed command.

## Promotion gate

1. Run the complete local suite on `main`.
2. Confirm no accidental or unrelated files are included.
3. Confirm `vercel.json` enables automatic Git deployment only for `main`.
4. Confirm Production-scoped variables exist without printing values and the
   existing Stripe test webhook targets the stable Production URL.
5. Review and apply only approved checked-in migrations.
6. Push `main` without force and wait for the Vercel Production
   deployment to become `READY`.
7. Complete the
   [Production-beta verification checklist](./production-beta-verification.md).

Stop on a failed local check, unexpected ancestry, migration drift, missing
resource, deployment failure, provider failure, or credential mismatch. Do not
substitute a Preview deployment.

## Location and Explore behavior

Geoapify supplies server-mediated autocomplete and controlled administrator
geocoding. MapLibre renders organizer and Explore maps with the configured
OpenFreeMap style. Confirmed coordinates are stored permanently in
Neon/PostGIS. Hosted acceptance must exercise structured selection, pin
confirmation, unconfirmed-provider failure, exact/approximate/hidden privacy,
list-view network isolation, map attribution, and explicit bounded
**Search this area** behavior.

## Future live launch

Live launch is a separate reviewed change. It includes removing
`PRODUCTION_BETA_MODE`, replacing Stripe test resources with approved live
resources, setting `STRIPE_MODE=live`, enabling indexing only after the
SEO/content gate, and completing a dedicated launch runbook. Environment
validation intentionally rejects a partial or mismatched transition.
