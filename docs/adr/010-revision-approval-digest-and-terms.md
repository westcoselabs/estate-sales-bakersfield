# ADR 010: Revision approval digest and versioned terms

Status: accepted for Phase 3

## Decision

Approval requires a verified, active, non-restricted owner with completed organizer onboarding, current optimistic version, all server-derived readiness requirements, and explicit acceptance of the current publishing terms version.

The application builds the same future public projection used by listing preview, adds revision identity, event/organizer identity, ordered sanitized variant hashes, cover identity, and a private-location evidence object, then hashes canonical JSON with SHA-256. Exact address evidence exists only inside the digest input and private location row; it is not copied into audit metadata. The transaction inserts an immutable `event_approvals` row, binds it as the current approval, stores accepted revision/digest/terms/timestamps/identity on the event, and writes a redacted audit event.

Any material detail, schedule, location/privacy, ready-photo, order, cover, or deletion change increments `contentRevision` and clears current approval. Public organizer display-name/website changes and organizer eligibility changes atomically advance every owned event revision and invalidate current approvals in the organizer-profile transaction; private contact-only changes do not. Historical proof remains.

## Consequences

Phase 4 can reject checkout if revision or digest changed. Approval is not payment, publication, inventory reservation, or fulfillment, and none of those transitions are implemented here.
