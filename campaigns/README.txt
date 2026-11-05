ESTATE SALES BAKERSFIELD — REUSABLE PARTNER EMAIL

This is a local preparation workflow. It never imports contacts, creates app
accounts, publishes templates, schedules broadcasts, or sends any email.

FIRST CAMPAIGN
Subject: Simply Decorated: nearly 150 estate sale photos to explore
Partner: Simply Decorated by Riley
Listing: https://estatesalesbakersfield.com/estate-sales/beautiful-huge-estate-sale-b13a81b2f116
Verified November 5, 2026: 148 photos; November 5–7, 8 a.m.–1 p.m. Pacific;
1913 Morning Rose Drive, Bakersfield, CA 93312; cash only.
Recheck the listing before sending. Do not send this dated promotion after the
sale ends on November 7 at 1 p.m. Pacific.

The owner requested a city correction on November 5, 2026. The listing and
search record now use Bakersfield, CA. Live public search returns the listing
and its map marker, including within the user's supplied map bounds. The
secondary browse link uses that bounded search URL.

AUDIENCE
158 unique addresses: 126 subscribed candidates, 9 unsubscribed, 23 cleaned.
No duplicate or malformed addresses in this export.
Category: Estate Sale Attendees. Source tag: Simply Decorated.
All are labeled audience:attendee, with partner:simply-decorated-by-riley,
source:mailchimp, and batch:ce3f2d590c. Original source tags and consent timestamps
are preserved. No business-owner tag is applied. Being an imported attendee
does not create or verify an app account or change an existing user's role.

The user confirmed on November 5, 2026 that the partner's subscriber permission
covers promotional emails sent by Estate Sales Bakersfield. This confirmation
is recorded in the config and manifest. It does not create verified app accounts
or change the app's marketing-consent records. All suppressions remain excluded.

DELIVERABLES (git-ignored .local/campaigns/simply-decorated-2026-11-05/)
preview.html: browser review with a visible draft banner; do not send this file.
campaign.html: email HTML with inline styles and Resend unsubscribe placeholder.
campaign.txt: matching plain-text email with the same unsubscribe placeholder.
campaign-manifest.json: counts, provenance, tags, status, and pending details.
attendees-all-tagged.csv: audit master; not the campaign recipient import.
attendees-subscribed-candidates.csv: 126 source subscribers; permission confirmed
by the user, still subject to reconciliation with current provider suppressions.
attendees-suppressions.csv: 32 excluded records, unsubscribed=true.
invalid-addresses-review.csv: rejected-address report (header only for this batch).
resend-draft-payload.json: incomplete draft payload, explicitly send=false.

Provider credentials are not stored in any campaign file. Recipient files stay
under .local, which is excluded from Git. Do not move them into public/ or commit
them. The source ZIP remains unchanged in Downloads.

BEFORE THE PROVIDER IMPORT / DRAFT SAVE
1. Partner permission confirmed by the user on November 5, 2026.
2. Mailing footer confirmed by the owner on November 5, 2026:
   9208 Alki Ct, Bakersfield, CA 93312. A verified From address is still needed.
3. Access the correct Estate Sales Bakersfield Resend team. Create a segment
   named "Attendees | Simply Decorated by Riley | ce3f2d590c". Keep business-owner
   campaigns in their own segment. Do not choose all contacts for this broadcast.
4. Reconcile suppressions first. For the 32 suppressed contacts, preserve or set
   unsubscribed=true; map cleaned to true as well. Never overwrite an existing
   provider unsubscribe with false. Check current provider suppressions against
   all 126 candidates. Exclude those suppressed in either source.
5. Import only permission-approved, nonsuppressed candidates to the attendee
   segment. Map email/first_name/last_name/unsubscribed explicitly. Map audience,
   partner, and tags as custom properties if supported, and retain the audit CSV.
   Existing contacts must retain their unsubscribe state; if an import skips
   duplicates, explicitly add eligible existing contacts to the segment without
   changing their subscription status. Keep old partner tags as original_tags.
6. Fill segment_id and from in the draft payload. Save as a draft with send=false
   and no schedule. Check the saved draft's segment, recipient count, content,
   reply-to, footer, links, and draft status. Do not send a test without the
   user's instruction. Final dispatch remains a separate user decision.

The website now has /admin/contacts for external audience CSV imports, category
and source filtering, suppression tracking, and subscribed-only CSV exports.
The Email Center has a saved standalone HTML draft for this imported attendee
audience. Its Inbox preview sends to one entered address; attendee dispatch is
not enabled for this draft. The saved draft was tested with the owner address.

REUSE FOR ANOTHER LISTING
Copy simply-decorated-2026-11-05.json to a new campaign config. Update the partner,
partner tag, audience tags/batch, segment name, campaign slug, listing URL,
dates/end time, photo count/copy, images/alt text, address, and all content fields.
Use actual publicly released listing details. Confirm each partner's permission
independently. Reset consent_confirmed=false and remove the previous
consent_confirmation until confirmed. Keep audience_type
as attendee. Business-owner outreach needs a separate audience and message.

From the repository root run (with Python 3):
python scripts/prepare-partner-campaign.py --config campaigns/simply-decorated-2026-11-05.json --audience-zip "C:/Users/citry/Downloads/audience_export_ce3f2d590c.zip" --output .local/campaigns/simply-decorated-2026-11-05

The script reads the three CSVs directly from the ZIP, normalizes/deduplicates
emails with suppression taking precedence, escapes spreadsheet formula-like
text, and renders escaped template values. It has no network or send capability.
It is not an email-deliverability or consent verifier.

Layout uses the existing green-and-gold identity, website logo, real sale photos,
two prominent listing links, an additional browse link, a text alternative,
tracking parameters, and a provider unsubscribe placeholder. Desktop/mobile
browser verification is not a substitute for testing in actual email clients
after the user authorizes a test.

Provider references checked November 5, 2026:
https://resend.com/docs/api-reference/broadcasts/create-broadcast
https://resend.com/migrate/mailchimp

NOVEMBER 5 DESIGN REVISION
The partner-sale.html template now uses an editorial layout guided by the
ui-ux-pro-max skill: brand green/gold, Georgia and Arial system fonts, clear
hierarchy, a single primary gallery action, and responsive stacked sale details.
Set COVER_PHOTO_URL and COVER_PHOTO_ALT for each new listing. Use the verified
public cover image at its original aspect ratio; do not crop information from
flyers. Update image width/height attributes if a future cover has another ratio.
This campaign uses the live listing cover at /media/6c540f28-8f3e-42df-accc-0f246ee0e4e6/cover.

The current campaign is stored in Admin > Email > Campaigns as a standalone HTML
draft with the Simply Decorated / Estate Sale Attendees audience selected.
Saving/editing this draft does not send, schedule, publish a template revision,
or import contacts again. The public email layout uses inline/table-based styles
and optional mobile/dark CSS. Real email-client testing remains unperformed;
no test email has been authorized or sent.

NOVEMBER 5 DESIGN REVISION 3
The prior logo file has an opaque white background and showed as a white box
in the inbox. The campaign now uses a styled text masthead, a dark green
invitation panel, and the full listing cover immediately beneath it. The
reusable template uses PHOTO_COUNT from the campaign config. The corrected
HTML was saved as campaign version 4 and a new owner test was submitted.
