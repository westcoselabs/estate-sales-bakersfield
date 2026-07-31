# Super-admin MVP

The owner portal is intentionally limited to `/admin`, `/admin/users`, and
`/admin/listings`. Server-rendered pages call configured services in
`src/modules/admin`; browser mutations use same-origin JSON routes. The module
owns reporting and administrative projections without extending organizer
event repositories or exposing Prisma outside infrastructure.

PostgreSQL remains reporting truth. Paid `PaymentAttempt` rows provide gross
revenue and purchases even when the event is later canceled or removed.
`EventPublication.snapshot` provides immutable publication truth. Administrative
removal suppresses access but does not refund payment, rewrite publication
history, or purge media.

Only one active, verified `SUPER_ADMIN` is supported. A partial unique index
enforces that limit. Super-admin sessions have an eight-hour absolute
expiration; sensitive mutations require password authentication during the
preceding 15 minutes. Reauthentication rotates the opaque token while
preserving the original absolute expiration.

The application deliberately has no MFA in this MVP. This accepted risk is
partially reduced by short absolute sessions, recent-password confirmation,
database-backed limits, session rotation, protected operator provisioning, and
append-only audit records. These controls do not eliminate the risk of owner
credential compromise.

Marketing eligibility requires an ordinary active, verified account, an
explicit `marketing-v1` consent record, and no unsubscribe timestamp. Missing
preference rows are ineligible. Export bytes exist only in memory and formula
prefixes, RFC 4180 quoting, row caps, request correlation, and immutable export
audits apply.

Listing lifecycle is derived from the mutually exclusive terminal timestamps:
deletion, organizer cancellation, or administrative removal. Restoration is
limited to removed events with a valid retained publication, correlated paid
and fulfilled transaction, ready snapshot media, an eligible organizer, and a
confirmed location when the publication has not ended.
