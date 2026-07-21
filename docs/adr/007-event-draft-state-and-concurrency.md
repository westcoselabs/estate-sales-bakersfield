# ADR 007: Event draft state and optimistic concurrency

Status: accepted for Phase 3

## Decision

Use three application-owned pre-payment states: `INCOMPLETE_DRAFT`, `PREVIEW_READY`, and `APPROVED_FOR_PAYMENT`. Readiness is derived on the server from complete details, a valid UTC/local schedule, verified private location, privacy mode, at least one `READY` photo, and an event-owned `READY` cover.

Every browser mutation supplies the current positive `version`. PostgreSQL updates use owner plus version predicates and increment the version atomically. A stale update changes zero rows and maps to a typed conflict. Material public-content changes also increment `contentRevision`, clear current approval fields, and return the event to a derived draft state. Upload reservation alone changes the concurrency version but not public content revision.

Payment/publication states are not included. The `origin` constraint permits only owner-created Phase 3 drafts; future imported sources require a forward migration.

## Consequences

Multiple tabs cannot silently overwrite each other. Approval is revision-bound, historical approval rows remain append-only evidence, and Phase 4 can compare the current revision/digest before checkout without adding a publication transition in Phase 3.
