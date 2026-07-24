# Location and Explore Implementation Handoff

**Status:** Active implementation authority

**Date:** 2026-07-24

**Decision:** [ADR 013](../adr/013-maplibre-openfreemap-geoapify-location.md)

## Provider architecture

| Boundary                  | Active provider or authority                          |
| ------------------------- | ----------------------------------------------------- |
| Browser map rendering     | MapLibre GL JS                                        |
| Launch style and tiles    | OpenFreeMap Liberty                                   |
| Organizer autocomplete    | Geoapify through `/api/locations/autocomplete`        |
| Controlled fallback       | Geoapify through authenticated admin resolution       |
| Permanent confirmed state | Neon/PostGIS `event_locations`                        |
| Public privacy authority  | publication snapshot plus application location policy |

Google Maps and Mapbox are superseded active targets. Historical ADRs and
reports remain unchanged.

## Organizer contract

1. Type at least four useful characters.
2. The client waits 325 ms, cancels stale work, and calls the authenticated
   application endpoint.
3. The server applies a Bakersfield rectangle, US filter, proximity bias,
   six-result limit, and durable per-user limit.
4. The server returns only normalized suggestions plus a time-limited signed
   selection token.
5. Selecting a suggestion fills structured fields and lazy-loads a MapLibre
   confirmation map.
6. The organizer confirms a non-draggable pin.
7. The event route verifies the token and permanently writes structured data,
   coordinates, PostGIS geography, provider provenance, actor, and timestamp.
8. Editing the address or unit clears client confirmation. A changed address
   without a new signed selection saves as `UNCONFIRMED`.

Provider failure preserves free-form draft text. Photos and review remain
available, but preview approval, payment, and publication require a verified,
confirmed location.

## Server contracts

- `GET /api/locations/autocomplete?q=...`
  - authenticated;
  - one strict `q` parameter;
  - 30 requests per user per 60 seconds;
  - `429` with `Retry-After`;
  - no query or coordinate logging.
- `POST /api/admin/locations/resolve`
  - same-origin authenticated administrator only;
  - structured US/Bakersfield input;
  - 10 requests per administrator per 60 seconds;
  - normalized provider-neutral response;
  - no public fallback.
- `PUT /api/events/:eventId/location`
  - accepts optional signed selection and confirmation flag;
  - stores unconfirmed text without coordinates when selection is absent;
  - reuses an unchanged confirmed location;
  - invalidates revision approval on location changes.
- `GET /api/search?projection=list|map`
  - list contains cards and no geometry;
  - map contains identical loaded listing IDs plus narrow safe marker DTOs.

## Public Explore contract

Desktop uses a split list/map layout. Cards and markers share public listing
IDs and one selected state. The map uses estate/yard forest-gold styling,
selected state, loaded-page clustering, preview, and an explicit
**Search this area** action.

Mobile keeps list as the default, exposes a sticky List/Map control, uses the
existing accessible filter dialog as a bottom sheet, and presents the selected
listing preview over a full-height safe-area map.

Bounds are accepted only inside the Bakersfield service rectangle and only
when both spans are at least 0.05 degrees. Panning performs no query. The
explicit action serializes bounds and clears the cursor.

## Privacy invariants

- Exact: confirmed exact point only while the public projection authorizes it.
- Approximate: stable `bakersfield` public-zone centroid for the listing
  lifetime.
- Hidden until start: public-zone centroid before release, confirmed point
  after authoritative release.
- Ended/canceled/removed listings do not remain in active public search.
- Protected bounds filtering uses the public-zone point.
- No rounding, jitter, offsets, reduced precision, raw publication snapshot,
  postal code, provider ID, private organizer data, or private coordinates.
- Protected title and description cannot contain the normalized private house
  number plus matching street.

## Runtime and test configuration

Production:

```text
GEOAPIFY_API_KEY=<private server value>
NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
```

Test uses the deterministic location adapter and
`https://map-style.test.invalid/fixture`, which the client converts to an
inline source-free style. Normal automated tests make no provider call.

Required checks are lint, architecture, TypeScript, Prisma validation,
production-equivalent build, all unit/integration/contract/Playwright suites,
changed-file formatting, migration status, and `git diff --check`.

## Release topology

Local development proceeds directly on `main`, then pushes to the existing
Vercel Production beta. Do not create an implementation branch, Preview
deployment, Preview resource, database, or webhook. Keep
`PRODUCTION_BETA_MODE=true` and the site-wide noindex posture.
