# Phase 4 Security Model

## Trust boundaries

- The authenticated browser may choose an owned event and submit its optimistic version. It cannot choose price, amount, currency, approval identity, publication state, success/cancel origin, Stripe metadata, or a public path.
- Cookie-authenticated Checkout and cancellation mutations enforce the existing trusted-origin policy beneath the route. Ownership and verified-organizer checks remain in application/repository layers.
- Stripe-hosted Checkout collects card data. The application never receives or stores card details.
- The success redirect and `session_id` query parameter are untrusted hints. Only a verified webhook or protected internal reconciliation can invoke authoritative fulfillment.
- The webhook accepts a bounded raw body, requires an endpoint signature, stores only bounded event correlation/status, and never logs the body or signature.

## Data and invariants

Payment rows contain only required internal/Stripe identifiers, immutable approval and server-price correlation, state/timestamps, and bounded reason codes. Checkout URLs, raw payloads, signatures, secrets, email, customer/card details, approval tokens, exact addresses, and raw exceptions are excluded. Audit and durable-job evidence follows the same bounds.

The database prevents correlation/price mutation, multiple active unpaid attempts, duplicate webhook IDs, publication without a matching paid attempt, multiple authoritative publications, and publication mutation/deletion. Serializable transactions plus event locking and optimistic versions prevent partial or cross-revision publication.

Public detail, metadata, structured data, caches, and media authorization require an immutable publication. The address projector is applied at response time for hidden-until-start listings; neither coordinates nor premature street address enter the public projection.

## Environment isolation

Local/Test default to deterministic fake Stripe. Test strips/rejects real Stripe credentials. Preview requires a test key, `STRIPE_MODE=test`, and `STRIPE_RESOURCE_ENV=preview`. Provider markers are an application safety check, not cryptographic account attestation, so the operator must still verify the Stripe account/Product/Price/webhook in the dashboard. Production configuration remains separate, unset, and untouched.

Residual operational risks are Preview resource misidentification, webhook endpoint misconfiguration, an unapproved business price, delayed job scheduling, paid-but-blocked support handling, and Production legal/tax/refund decisions. The Preview checklist and recovery runbook make these explicit launch blockers.
