# ADR 011: Stripe-hosted Checkout and webhook-authoritative fulfillment

Status: accepted for Phase 4

## Decision

Use a regular Stripe account and one-time Stripe Checkout Sessions in hosted mode for owner-created listing publication. Do not use Stripe Connect, a cart, subscriptions, embedded Checkout, a custom Elements form, marketplace payouts, or direct card-data collection. Checkout is restricted to immediate card payment for the Phase 4 Preview proof.

Pricing is server-authoritative. The browser submits only the event identifier and optimistic event version. Vercel Preview must configure a test-mode Stripe Price ID, expected minor-unit amount, expected three-letter currency, test secret key, Preview-only webhook signing secret, and `STRIPE_RESOURCE_ENV=preview`. The frozen roadmap does not define a final fee, so this ADR deliberately does not choose one. Local and Test use clearly labeled deterministic fixtures that are not business pricing. Production Stripe configuration remains separate and unset during Phase 4 implementation.

The application creates an immutable internal payment attempt before it creates the hosted Checkout Session. The attempt binds one owner, organizer, event, approval row, approved content revision, SHA-256 approval digest, Stripe Price ID, amount, currency, application environment, and attempt generation. A database partial unique index prevents more than one compatible active Checkout attempt for an event. Stripe idempotency keys derive from the internal attempt ID and generation, not customer data.

Checkout metadata contains only stable correlation identifiers: payment attempt ID, event ID, approved revision, approval digest, and application environment. It contains no email, organizer contact data, address, raw token, or provider secret. Session URLs are returned transiently and are not persisted or logged.

## Payment authority and fulfillment

The signed Stripe webhook is the authoritative payment notification. The success redirect is a correlation hint and status view only; it cannot publish or invoke a client-side publication transition. The webhook handler reads the raw body, verifies `Stripe-Signature`, allows only the supported Checkout events, persists the Stripe event ID under a unique constraint, and treats previously processed deliveries as successful no-ops.

Webhook and reconciliation paths call the same fulfillment service. That service retrieves the authoritative Checkout Session with line items, requires `payment_status=paid`, and validates session ID, internal metadata, environment, Price ID, quantity, amount, currency, event ownership, organizer eligibility, exact approval row/revision/digest, current material revision, schedule, location projection, ready photos, cover, and absence of a conflicting publication.

One database transaction records payment evidence, publishes one immutable snapshot of the approved projection, appends redacted audit entries, and marks fulfillment complete. The snapshot is correlated to the exact approval and payment attempt and owns the stable canonical path. Hidden-until-start snapshots retain their approved address evidence privately and project only city/region until authoritative server time reaches the event start. Public routes never read a mutable draft as the listing authority.

If an event is materially edited after Checkout creation, the existing approval invalidation remains authoritative. A later payment is recorded as paid but blocked from publication, with bounded reason-coded evidence and an audit entry. No automatic refund is introduced. Published Phase 4 events reject editing; the broader paid-edit and relocation workflow remains Phase 5.

## Recovery

Each attached Checkout Session enqueues a deduplicated PostgreSQL durable reconciliation job. The authenticated job runner also discovers stale, paid, processing, and retrying attempts, retrieves their authoritative Checkout state, and invokes the same fulfillment service with bounded retry, stale-lock recovery, and existing dead-letter behavior. A small internal script can enqueue or run recovery for a specific attempt without adding an administration product.

## Consequences

Preview Checkout requires manual Stripe test resources and a Preview webhook endpoint. Ordinary automated tests require no network or real Stripe credentials. Payment and publication records retain only bounded correlation and financial evidence; full webhook payloads, card data, signatures, Checkout URLs, private addresses in payment metadata, raw exceptions, and secrets are not retained or logged. Production pricing, live Product/Price, live webhook, tax/legal approval, refunds, packages, coupons, and launch remain separate work.
