# Admin Email Center operations

PostgreSQL is the source of truth for template revisions, receipt deliveries,
campaign snapshots, recipients, provider identifiers, and webhook
deduplication. Resend is the delivery provider; provider payloads are never
persisted or logged.

## Rollout

1. Apply `20260731120000_admin_email_center` with `prisma migrate deploy` in
   the confirmed target environment.
2. Run `pnpm email:seed-templates` with `APP_ENV`, `DATABASE_RESOURCE_ENV`, and
   `DATABASE_URL` pointing to that same environment. The command is
   idempotent and requires the provisioned active, verified super-admin.
   For the checked-in local environment only, use
   `pnpm email:seed-templates:local`.
3. Keep `EMAIL_CAMPAIGNS_ENABLED=false` while verification, password-reset,
   receipt, and owner-only test sends are checked.
4. Configure Resend to deliver signed events to `/api/webhooks/resend`, and set
   `RESEND_WEBHOOK_SECRET` to the endpoint signing secret.
5. Configure both protected cron routes with the checked-in daily Hobby
   schedules: `/api/internal/jobs/run` at `0 9 * * *` and
   `/api/internal/email-jobs/run` at `0 10 * * *`. Vercel evaluates these in
   UTC, may invoke a Hobby cron anywhere in the configured hour, and sends the
   configured `CRON_SECRET` automatically. Queued receipts and contact sync can
   therefore wait roughly one day; at the current batch limit of 10, larger
   backlogs carry into later runs. Campaigns remain disabled during beta.
6. In Production only, confirm `RESEND_RESOURCE_ENV=production`, then set
   `EMAIL_CAMPAIGNS_ENABLED=true` and deploy. Preview never dispatches a
   campaign.

## Recipient policy

Campaign recipients are ordinary active users with verified email addresses
who have not unsubscribed. Missing marketing-preference records are included.
The owner, restricted or disabled users, unverified users, and locally or
provider-unsubscribed contacts are excluded at send time. Resend suppression
remains an additional final delivery guard.

## Send safety

Template publishing requires a successful test of the exact draft digest in
the preceding 30 minutes, recent-password confirmation, and `PUBLISH`.
Campaigns require an owner test, recent-password confirmation, and `SEND`.
The worker transitions a campaign to `DISPATCHING` before the single provider
send call. A timeout with an unknown provider result becomes `NEEDS_REVIEW`
and is never automatically sent again.

Purchase receipts are inserted with their durable job in the same transaction
that first records a paid payment attempt. The unique payment-attempt reference
prevents duplicate receipts. Receipt failure never changes payment or
publication truth.
