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
5. Configure the protected cron routes from `vercel.json`. Email jobs run every
   minute; the send endpoint also starts a worker after responding. The email
   worker runs one job at a time with a 20-second admission budget. Imports are
   asynchronous and resume on durable retries. Other jobs keep their existing schedule.
6. In Production only, confirm `RESEND_RESOURCE_ENV=production`, then configure
   a Resend Full access key as the sensitive `RESEND_CAMPAIGN_API_KEY`, set
   `EMAIL_CAMPAIGNS_ENABLED=true`, and deploy. Keep the sending-only
   `RESEND_API_KEY` for tests and transactional mail. The server checks
   segment access before queuing a campaign.

## Recipient policy

Imported contact groups are available in the campaign composer after applying
`20261105000200_campaign_contact_drafts`. Choose **Imported contacts**, then the
source/category pair (for example Simply Decorated / Estate Sale Attendees).
The saved filter is independent of registered-user audiences. The detail page
recounts current eligible contacts, excluding unsubscribed/cleaned records,
missing permission, and matching account restrictions, opt-outs, bounces and
complaints. This is an audience preview, not a frozen recipient list.

**HTML email draft** lets an administrator paste an existing branded email
without publishing a template or sending an owner test. HTML is sanitized and
must include the unsubscribe placeholder. The saved preview runs in a sandboxed
iframe; remote images load only after selecting Load email images. Draft edits
retain optimistic version checks and administrator-session authorization.

Apply `20261106000100_contact_campaign_sending` before enabling imported-contact
sending. It replaces the draft-only constraint with a dedicated, immutable contact
recipient snapshot table. Saving a draft still creates no provider resources or jobs.

**Inbox preview** sends a saved HTML version to one address. **Send owner test**
sends to the signed-in administrator. Successful tests mark only that exact version
as tested; any saved change clears the test. A stale test completion cannot approve
new content. The preview unsubscribe URL is a sample placeholder.

**Review and send** shows the selected source/category and current eligible count.
The administrator confirms their password and types `SEND`, then selects **Send
campaign**. The server checks the version, test, session, feature flag, and audience
before atomically saving the contact IDs and email addresses and one durable job.
Later imports cannot join that snapshot. Attendees and business owners stay separate.

The worker rechecks local eligibility, imports with `onConflict: upsert` and no
subscription field (preserving provider opt-outs), verifies all pages of the campaign
segment, removes newly excluded recipients, and compares membership before sending.
Missing or unexpected members prevent dispatch. Consent is checked again after
provider preparation. Broadcast content uses the saved HTML, preview text, subject,
and real provider unsubscribe placeholder. The page polls while queued or sending.

A failed preparation is marked `FAILED`. An uncertain send or an interrupted worker
after the dispatch boundary is marked `NEEDS_REVIEW`. Do not create a replacement
send until the provider broadcast result is checked. Signed bounce, complaint,
suppression, and unsubscribe webhooks suppress matching imported contacts as well
as registered accounts. Provider resubscribe events never override local opt-outs.

Campaign recipients are ordinary active users with verified email addresses
with recorded marketing consent who have not unsubscribed. Missing consent or
marketing-preference records are excluded.
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
