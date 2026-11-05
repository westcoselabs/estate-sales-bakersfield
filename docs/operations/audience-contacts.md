# External mailing contacts

`/admin/contacts` stores external mailing-list contacts separately from registered
users. Importing never creates accounts, queues jobs, subscribes contacts at a
provider, or sends email. The campaign studio can save imported-contact audience
selections and branded HTML as drafts. External dispatch is not enabled; the
subscribed CSV export remains available for provider preparation.

Apply `20261105000100_audience_contacts` before deploying this feature. It only
adds the contact and import-history tables. Existing account data is unchanged.

## Import

Extract ZIP archives first. Upload a CSV (maximum 500 KB / 5,000 rows), choose
Estate Sale Attendees or Business Owners, enter the partner/source tag, and
preview. Columns are `email`, `first_name`, `last_name`, `status`; Mailchimp's
Email Address / First Name / Last Name headers are accepted. The prepared partner
campaign CSV's `source_status` and `unsubscribed` columns are also supported.
Choose a fallback status only for exports without a status column. Unknown
statuses or invalid rows block the entire import until corrected.

Subscription requires the administrator's confirmation that permission covers
Estate Sales Bakersfield promotional emails. The import records that confirmation
time and administrator; it does not claim this is the subscriber's original
opt-in timestamp. Source files and original consent evidence stay outside Git.

Email addresses are normalized and unique. Cleaned takes precedence over
unsubscribed, which takes precedence over subscribed. Re-imports cannot restore
suppressed contacts. Existing categories are preserved; source tags accumulate.
An identical input is idempotent. Import and unsubscribe actions are serialized,
authorized against the live administrator session, and audited.

## Future campaigns

Filter by category, source tag, name/email and status. The CSV export includes
only subscribed contacts with confirmed permission matching the category, source
and search, across all pages (up to 10,000). The status display filter does not
change the export's subscribed-only policy. Password confirmation is required.
Current matching account opt-outs/restrictions and known account delivery
suppressions are excluded as well. Formula-like CSV fields are escaped.

Reconcile any newer provider unsubscribes, complaints or bounces before using an
export for a send. Contacts are not yet connected to provider webhooks or the
campaign studio's dispatch pipeline. The contact action can suppress an address;
there is intentionally no bulk re-subscribe action. Keep campaigns as drafts
until their audience, sender, footer, unsubscribe link and content are reviewed.
