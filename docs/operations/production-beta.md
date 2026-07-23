# Stable Production Beta Runbook

This runbook covers the stable Vercel Production deployment while Stripe remains in test mode. It is not authorization for live Stripe resources or real charges.

## Required environment posture

- `APP_ENV=production`
- `PRODUCTION_BETA_MODE=true`
- `APP_URL` is the stable HTTPS Production origin
- Production Neon and private Blob credentials with matching `production` resource markers
- real Resend and Mapbox adapters with matching `production` resource markers
- Stripe test secret key, test Price, expected amount/currency, `STRIPE_MODE=test`, and `STRIPE_RESOURCE_ENV=production`
- a new test-mode webhook signing secret scoped to the stable Production `/api/webhooks/stripe` endpoint
- independently generated Production `AUTH_FINGERPRINT_SECRET` and `CRON_SECRET`

The browser does not receive the beta flag, Stripe secret, webhook secret, database URL, Blob token, or provider credentials. Production beta uses Stripe-hosted Checkout and webhook-authoritative fulfillment. Its success redirect cannot publish.

## Migration gate

Load the intended Production Neon variables without displaying them. Confirm the `production` resource marker, run `pnpm prisma:validate`, then `pnpm prisma migrate status`. Review every pending checked-in migration before running `pnpm prisma migrate deploy`. Stop on drift or ambiguous status. Never use `db push`, `migrate reset`, broad cleanup, or replacement seed commands.

## Promotion gate

Before fast-forwarding `main`, require a clean verified Phase branch, complete Production-scoped Vercel variables, the endpoint-specific Stripe test webhook secret, successful checked-in migrations, and a final ancestry check. Push without force and wait for the Vercel Production deployment to become READY. Verify `/api/health`, runtime logs, authentication, private upload processing, exact approval, test Checkout, signed webhook delivery, and exactly-once publication.

## Future live launch

Live launch is a separate reviewed change. Remove `PRODUCTION_BETA_MODE`, replace the test secret key, Product/Price, expected amount/currency, and endpoint signing secret with approved live resources, and set `STRIPE_MODE=live`. Environment validation intentionally rejects a partial or mismatched transition.
