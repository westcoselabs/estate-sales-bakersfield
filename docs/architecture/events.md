# Phase 3 Event Architecture

## Boundaries

`events/domain` owns event types, narrow records/DTOs, slugs, schedule conversion, and typed errors. `events/application` owns schemas, readiness/state rules, public/private projections, approval digest construction, and the event workflow service. `events/infrastructure` is the only event layer that imports Prisma. Location, media, and image processing enter through application-owned ports.

App Router handlers import `@/modules/events`, validate JSON, enforce trusted origin on every cookie-authenticated mutation, obtain the session principal centrally, and map typed failures to no-store user-safe responses. Browser ownership IDs are never accepted.

## Persistence and transactions

Migration `20260721000000_phase3_event_builder` is forward-only after Phase 2. It creates event/location/photo/reservation/approval types and tables, ownership/index/consistency constraints, a PostGIS GIST index, and triggers for photo limits, reservation/photo identity, ready cover ownership, cover preservation, approval identity/revision, and current-proof consistency.

Material mutations use `(event id, owner user id, expected version)` predicates. Approval uses serializable isolation. Location writes use parameterized tagged SQL solely because Prisma cannot write the PostGIS geography field; exact scalar values and `ST_SetSRID(ST_MakePoint(...),4326)::geography` are committed with the event version change.

Public organizer display-name/website changes and organizer eligibility changes are material to the listing. The organizer-profile transaction advances affected event revisions, invalidates current approvals, and appends redacted event audit entries atomically. Private contact-only changes do not alter event content.

## Daily schedules and address release

Migration `20260915030000_daily_schedule_address_reveal` adds nullable `events.schedule_days` and `events.address_reveal_at`. The builder selects individual dates and submits `scheduleDays: [{ date, startTime, endTime }]` in Pacific time. Each day must close after opening on the same date; duplicate dates, invalid calendar values, and ambiguous/nonexistent daylight-saving times are rejected. Overall start/end timestamps are derived from the first opening and final closing. Published snapshots retain every daily interval, and date searches match those intervals, including skipped dates. Legacy listings keep their existing overall schedule without invented daily hours.

The organizer chooses either an exact public address or **Hide address until** a local date and time. The API accepts `localAddressRevealAt`, converts it to UTC, and includes that instant in the approval digest and immutable publication snapshot. The stored `HIDDEN_UNTIL_START` enum remains compatible with existing records; when a legacy snapshot has no `addressRevealAt`, its release still falls back to the sale start. Public address notices and search-cache validity use the actual release instant.

Before release, the map receives a fixed neighborhood cell center and approximate radius rather than the private coordinates. Broad zoom shows a sale marker; close zoom shows a shaded, dashed area. Viewport filtering uses the same coarse position. Exact address and coordinates become available at the selected release instant. Apply the migration before deploying the updated application.

## State and privacy

`INCOMPLETE_DRAFT` and `PREVIEW_READY` are derived by application policy. `APPROVED_FOR_PAYMENT` records exact revision approval, not publication. Phase 4 publication creates a separate immutable snapshot bound to that approval digest and payment attempt. Approximate and pre-start hidden runtime projections never serialize exact coordinates/address. Published events remain editable until their final closing time. Details, daily schedule, and ready-photo changes atomically update `events.published_snapshot`; the original paid publication, approval proof, canonical path, organizer, and address remain immutable. Search reads the current snapshot when present, and database triggers update search dates and invalidate cached results in the same transaction. Published listings must retain a description and ready cover. Ended publications derive the `FINISHED` display state, appear only in dashboard History, and cannot be canceled or edited. No scheduled job is required. Apply migration `20260916000000_published_event_edits` before deploying.

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

Dashboard/editor/preview/payment pages are under `/dashboard`. Canonical `/estate-sales/[slug]-[publicId]` and `/yard-sales/[slug]-[publicId]` detail routes return not-found until an immutable publication exists, redirect noncanonical slugs to the stored canonical path, and read the current published snapshot, falling back to the original paid snapshot for unedited listings.
