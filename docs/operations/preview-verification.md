# Preview Verification

## Safety gate

1. Confirm the current Git branch is not the configured Vercel Production Branch, or use an explicit Preview deployment command.
2. Confirm `APP_ENV=preview` without printing secrets.
3. Confirm Preview-only Neon, Resend, Blob, Mapbox, and Stripe test resources and matching `*_RESOURCE_ENV=preview` markers, including `DATABASE_RESOURCE_ENV=preview` and `STRIPE_RESOURCE_ENV=preview`.
4. Apply `prisma migrate deploy` only to Preview Neon. Never run `prisma db push`.
5. Use an approved controlled email recipient or provider test mode.

## Phase 2 workflow

Register, receive verification, verify, log in, persist the session, complete onboarding, logout/login, request and receive reset, reset, verify prior-session revocation, reject the old password, accept the new password, and exercise safe provider failures.

Exercise each PostgreSQL authentication limit namespace, verify cross-instance shared enforcement and expiry, simulate a safe database failure, and invoke the authenticated job endpoint to confirm expired-bucket cleanup. Do not print identifiers, bucket hashes, database URLs, or bearer secrets.

## Phase 3 workflow

Create and resume a draft; save details/schedule; validate a Bakersfield address and all three privacy projections; upload and sanitize a photo; choose/reorder/delete photos; choose a ready cover; verify stable media; compare exact preview with the future projector; accept current terms; approve; edit material content; verify invalidation; re-preview/reapprove; and verify cross-user denial. Clean only controlled test data and isolated Preview Blob objects.

## Phase 4 Stripe configuration

Create a test-mode Product and one-time Price in the regular Stripe account. Have the product owner approve its amount and currency; the repository deliberately chooses neither. Add these values to Vercel **Preview only**:

| Variable                   | Value/source                                           |
| -------------------------- | ------------------------------------------------------ |
| `STRIPE_SECRET_KEY`        | Stripe test secret key; Vercel sensitive value         |
| `STRIPE_WEBHOOK_SECRET`    | signing secret for this Preview endpoint only          |
| `STRIPE_PRICE_ID`          | approved test-mode one-time Price ID                   |
| `STRIPE_EXPECTED_AMOUNT`   | exact Price amount in minor units                      |
| `STRIPE_EXPECTED_CURRENCY` | exact lowercase three-letter currency                  |
| `STRIPE_MODE`              | `test`                                                 |
| `STRIPE_RESOURCE_ENV`      | `preview`                                              |
| `APP_URL`                  | exact protected/unprotected Preview application origin |

Register `https://<preview-host>/api/webhooks/stripe` and enable `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired`. Phase 4 Checkout restricts payment methods to cards, so the asynchronous events are defensive. Never place any Stripe value in `NEXT_PUBLIC_*`, tracked files, `.env.test.local`, logs, or screenshots. A deliberate local real-Stripe test may use `.env.local` with the same test-only values, but deterministic fake Checkout remains the default.

## Phase 4 hosted workflow

1. Deploy the Phase 4 branch as Preview and apply the new migration only to Preview Neon.
2. Complete account verification, organizer onboarding, event details, schedule, Preview Mapbox location, Preview Blob upload, cover selection, preview, terms, and approval.
3. Confirm the displayed price matches the approved server configuration. Start `Pay and publish`; confirm Stripe-hosted test Checkout and complete with a Stripe test card.
4. Confirm the return page initially trusts only internal state, webhook delivery succeeds, the dashboard becomes `Published`, and the canonical listing loads with correct media/metadata/JSON-LD and address privacy.
5. Repeat with cancel and confirm no publication. Replay the same webhook event and confirm one publication/audit pair. Temporarily delay delivery, run `pnpm payments:reconcile -- --attempt=<uuid>` or the authenticated job endpoint, and confirm the same result without another charge.
6. Create Checkout, materially edit the event, then complete the old Session. Confirm `Paid; publication blocked`, no public page, a bounded audit reason, and no automatic refund.
7. Invoke the scheduled job endpoint and retain sanitized counts for reconciliation candidates, completed/retried/dead jobs, stale-lock recovery, and authentication bucket cleanup.

Also repeat the Preview Resend verification flow, Preview Blob upload, Preview Mapbox validation, and scheduled job invocation after deployment. These are `BLOCKED` until the actual isolated resources are configured and exercised.

Unavailable resources are `BLOCKED` with the missing manual action. They do not turn into `PASS`. Do not deploy with `--prod`, promote, assign the public domain, or configure Production resources.
