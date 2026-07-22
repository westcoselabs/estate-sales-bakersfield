# Phase 3 Event Architecture

## Boundaries

`events/domain` owns event types, narrow records/DTOs, slugs, schedule conversion, and typed errors. `events/application` owns schemas, readiness/state rules, public/private projections, approval digest construction, and the event workflow service. `events/infrastructure` is the only event layer that imports Prisma. Location, media, and image processing enter through application-owned ports.

App Router handlers import `@/modules/events`, validate JSON, enforce trusted origin on every cookie-authenticated mutation, obtain the session principal centrally, and map typed failures to no-store user-safe responses. Browser ownership IDs are never accepted.

## Persistence and transactions

Migration `20260721000000_phase3_event_builder` is forward-only after Phase 2. It creates event/location/photo/reservation/approval types and tables, ownership/index/consistency constraints, a PostGIS GIST index, and triggers for photo limits, reservation/photo identity, ready cover ownership, cover preservation, approval identity/revision, and current-proof consistency.

Material mutations use `(event id, owner user id, expected version)` predicates. Approval uses serializable isolation. Location writes use parameterized tagged SQL solely because Prisma cannot write the PostGIS geography field; exact scalar values and `ST_SetSRID(ST_MakePoint(...),4326)::geography` are committed with the event version change.

Public organizer display-name/website changes and organizer eligibility changes are material to the listing. The organizer-profile transaction advances affected event revisions, invalidates current approvals, and appends redacted event audit entries atomically. Private contact-only changes do not alter event content.

## State and privacy

`INCOMPLETE_DRAFT` and `PREVIEW_READY` are derived by application policy. `APPROVED_FOR_PAYMENT` records exact revision approval, not publication. Phase 4 publication creates a separate immutable snapshot bound to that approval digest and payment attempt. Approximate and pre-start hidden runtime projections never serialize exact coordinates/address. Published Phase 4 events are edit-locked; the paid-edit workflow remains deferred.

## Routes

- `GET|POST /api/events`
- `GET|PATCH /api/events/[eventId]`
- `PUT /api/events/[eventId]/schedule`
- `PUT /api/events/[eventId]/location`
- `POST /api/events/[eventId]/photos/reserve`
- `POST /api/events/[eventId]/photos/[photoId]/finalize`
- `PUT /api/events/[eventId]/photos/[photoId]/cover`
- `PUT /api/events/[eventId]/photos/order`
- `DELETE /api/events/[eventId]/photos/[photoId]`
- `POST /api/events/[eventId]/approval`
- `GET /media/[photoId]/[variant]`
- `POST /api/events/[eventId]/checkout`
- `GET /api/events/[eventId]/payment-status`
- `POST /api/events/[eventId]/payment-cancel`
- `POST /api/webhooks/stripe`

Dashboard/editor/preview/payment pages are under `/dashboard`. Canonical `/estate-sales/[slug]-[publicId]` and `/yard-sales/[slug]-[publicId]` detail routes return not-found until an immutable publication exists, redirect noncanonical slugs to the stored canonical path, and read only the published snapshot.
