# Stripe live launch on estatesalesbakersfield.com

The owner's September 15, 2026 live-launch request supersedes the earlier payment/deployment deferral in historical preparation reports. This document describes configuration, not proof that activation or payment fulfillment has completed.

## Stripe account and price

Switch to the actual business account in live mode, outside Sandboxes and test mode. Complete any activation requirements shown by Stripe. Confirm payments are enabled and payout setup is complete.

In **Developers / API keys**, retrieve the live secret key beginning `sk_live_`. Store it as Vercel Production `STRIPE_SECRET_KEY`. The current server-hosted Checkout integration does not use a `pk_live_` publishable key. Never put either private secret in a `NEXT_PUBLIC_` variable, source control, or chat.

In the live **Product catalog**, use an active one-time listing-publication price for the intended fee. Copy the **Price ID** (`price_...`), not the Product ID (`prod_...`). Test prices do not transfer to live mode. The application currently supports one configured publication price, card payments, and no promotion codes. Its configured amount and currency must match the live Price exactly.

## Webhook destination

In live **Workbench → Webhooks → Create an event destination**:

1. Select **Your account** and snapshot events.
2. Use an API version compatible with the installed Stripe SDK (currently `2026-06-24.dahlia`), where offered.
3. Select exactly these events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
4. Choose **Webhook endpoint** and enter `https://estatesalesbakersfield.com/api/webhooks/stripe`.
5. Open that destination's signing secret, click **Reveal**, and store its `whsec_...` value as Vercel Production `STRIPE_WEBHOOK_SECRET`.

Use the secret for this live destination, not a sandbox endpoint or Stripe CLI listener. Do not use the `www` hostname: it redirects, and webhook delivery must target the final URL directly.

## Vercel Production variables

| Variable                      | Value                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `APP_ENV`                     | `production`                                                                                |
| `NEXT_PUBLIC_APP_ENV`         | `production`                                                                                |
| `APP_URL`                     | `https://estatesalesbakersfield.com`                                                        |
| `STRIPE_SECRET_KEY`           | Live account's `sk_live_...` key                                                            |
| `STRIPE_WEBHOOK_SECRET`       | This live destination's `whsec_...` secret                                                  |
| `STRIPE_PRICE_ID`             | Live one-time `price_...` ID                                                                |
| `STRIPE_EXPECTED_AMOUNT`      | Price in smallest currency units; e.g. `2500` for $25.00 USD (example, not an approved fee) |
| `STRIPE_EXPECTED_CURRENCY`    | `usd` for a USD price                                                                       |
| `STRIPE_MODE`                 | `live`                                                                                      |
| `STRIPE_RESOURCE_ENV`         | `production`                                                                                |
| `PRODUCTION_BETA_MODE`        | `false`                                                                                     |
| `PUBLIC_INDEXING_ENABLED`     | `true` after launch acceptance                                                              |
| `JOB_MAX_QUEUE_DELAY_MINUTES` | `15` with the five-minute Pro schedules                                                     |

Apply live credentials only to Production. Keep Preview on its separate test resources. Preserve existing database, Blob, Resend, authentication, and cron secrets. Leave imported-listing indexing and campaign dispatch at their separately approved settings.

Update the Stripe values and beta gate as one coordinated configuration change before deploying. Saving environment variables does not update an existing deployment: rebuild/redeploy. Deploy from the accepted commit and include the Pro cron configuration; do not accidentally bundle unrelated uncommitted work.

## Acceptance

- Run `scripts/check-release-config.ts public-launch` with the actual Production environment, without printing secret values. This checks configuration only.
- Verify `/api/health`, canonical metadata, the sitemap and robots on the live domain; check `www` redirects to the apex.
- Confirm the live Price is active, one-time, and matches the amount/currency; confirm Stripe's account is enabled to accept payments.
- An unsigned webhook should return HTTP 400. This proves rejection only, not that the live signing secret or delivery works.
- Verify an actual Stripe delivery returns 2xx. For end-to-end acceptance, the owner completes an intended live Checkout purchase; verify the paid attempt, webhook delivery, publication, dashboard status, and queued receipt. Do not simulate success by changing payment rows or use test card numbers in live mode.
- Observe both cron invocations and protected readiness after deployment. Check failure/reconciliation behavior using the [payment recovery runbook](payment-recovery.md).

References: [Stripe keys](https://docs.stripe.com/keys), [Stripe webhooks](https://docs.stripe.com/webhooks), [Vercel environment variables](https://vercel.com/docs/environment-variables), [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
