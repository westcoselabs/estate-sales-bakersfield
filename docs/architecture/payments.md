# Phase 4 Payment and Publication Architecture

## State and authority

An approved owner-created event can create one active `PaymentAttempt`. The row immutably binds the owner, organizer, event, approval row, content revision, SHA-256 digest, application environment, Stripe Price ID, expected minor-unit amount/currency, and attempt generation. Mutable fields track Checkout, payment, fulfillment, bounded recovery evidence, and optimistic version.

The success or cancel redirect has no publication authority. `POST /api/webhooks/stripe` reads a bounded raw body and verifies the signature before trusting the event. Supported event IDs are persisted uniquely; processed duplicates return success without repeating fulfillment. Immediate card payment is the only Phase 4 Checkout method.

Both webhook delivery and `PAYMENT_RECONCILE` retrieve the authoritative Session and invoke `PaymentService.fulfillSession`. It validates the exact Session/attempt metadata, line-item Price, amount, currency, quantity, payment intent, environment, ownership, organizer status, current approval/revision/digest, schedule, location, ready photo/cover, and conflicting publication state.

## Atomic publication

One serializable transaction locks the event, records paid evidence, creates the immutable `EventPublication` snapshot, appends `PAYMENT_RECEIVED` and `EVENT_PUBLISHED` audit entries, and marks fulfillment complete. PostgreSQL additionally enforces one publication per event/attempt/public ID/path, paid-attempt correlation, immutable attempt price/correlation, and immutable publication rows.

A mismatch after a confirmed payment records `PAID` plus `BLOCKED` and a bounded reason; it never publishes a changed revision and never auto-refunds. Repeated fulfillment returns the existing canonical path. Public pages and public media authorization require a publication and read the immutable snapshot, not the mutable event.

Hidden-until-start snapshots privately retain the approved exact address because it is part of the approval proof. Every runtime public projection before `startsAt` replaces it with city, region, country, and release time. Metadata and JSON-LD use that same runtime projection and never contain coordinates.

## Recovery

Attaching a Checkout enqueues one deduplicated `PAYMENT_RECONCILE` durable job. Candidate discovery covers complete, paid, processing, retrying, and stale unreconciled attempts. The existing runner supplies bounded attempts, stale-lock recovery, and dead-letter state. `pnpm payments:reconcile -- --attempt=<uuid>` runs the same application service for a controlled internal recovery; omitting the attempt enqueues current candidates.
