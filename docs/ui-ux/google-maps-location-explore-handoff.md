# Google Maps Location and Explore Handoff

**Status:** Planning only; Google implementation is blocked

**Branch:** `feature/ui-ux-overhaul`

**Audit baseline:** `15fd9c0226a93bc0cfbd17a899b2c9e06aa6efc7`,
plus the preserved uncommitted public marketplace/search work audited on
2026-07-23

**Superseding decision:** [ADR 012](../adr/012-google-maps-places-and-explore-location.md)

**Still-live decision:** [ADR 008](../adr/008-private-location-time-and-projections.md)

## 1. Purpose and authority

This handoff defines the conditional migration from the current Mapbox
location resolver to Google Maps Platform and the privacy-safe completion of
the shared `/search` map. It is not permission to implement, migrate data,
change provider resources, edit environment values, deploy, or enable
indexing.

When sources disagree, use this order:

1. Existing authentication, ownership, event, approval, payment, publication,
   privacy, and security rules in application code.
2. ADR 012 after its written eligibility gates pass.
3. ADR 008 for provider boundaries, time, PostGIS, and privacy rules that ADR
   012 does not replace.
4. Root `DESIGN.md`.
5. `docs/ui-ux/overhaul-plan.md`.
6. Mockups as conceptual visual references only.

Historical ADRs, frozen/checksummed roadmaps, phase reports, and completed
test evidence remain historical records and must not be rewritten. Mapbox
remains the current provider until a later approved implementation safely
replaces it.

## 2. Executive handoff

### Current source truth

- Organizer address input is a normal server-submitted form.
- `LocationProvider.validate()` receives organizer-entered structured address
  fields and timezone.
- Local and deployed non-test environments use Mapbox Geocoding v6 when
  `MAPBOX_ACCESS_TOKEN` is present; Test uses deterministic Bakersfield
  fixtures.
- The Mapbox call is server-only forward geocoding with `permanent=true`,
  `autocomplete=false`, `types=address`, one US result, and an eight-second
  timeout.
- The event update persists normalized provider address data, exact
  latitude/longitude, a PostGIS `geography(Point, 4326)`, provider identity,
  confidence, precision, and validation state in one row.
- Address updates invalidate approval and increment both event version and
  content revision.
- Readiness requires a `VERIFIED` location and a selected privacy mode.
- Approval hashes the normalized address, exact coordinates, provider name,
  Place ID, and validation state as private evidence.
- Immutable publication snapshots implement exact, approximate, and
  hidden-until-start address projections.
- `/search` is one server-rendered list system over paid immutable
  publications. It supports sale type, date presets/custom range, soonest sort,
  one Bakersfield locality, and criteria-bound cursor pagination.
- List cards contain no coordinates.
- `GET /api/search?projection=map` fails closed with
  `503 MAP_PROJECTION_UNAVAILABLE`.
- No Google or Mapbox browser map package is installed.
- Public search has no durable rate limiter, strict unknown/duplicate-key
  rejection, bounds model, map DTO, or address-text leak guard.
- The checked-in environment schema recognizes Mapbox variables, not
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` or `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`.
- The global CSP does not permit Google Maps sources and currently uses
  static `unsafe-inline` directives.
- Production beta remains server-rendered `noindex`; Google is not live.

### Conditional target

- Google Places autocomplete becomes the primary organizer selection flow.
- A selected Place and a non-draggable pin must be explicitly confirmed.
- First-party address data is separated from expiring provider evidence.
- Geocoding is an administrator-only interactive fallback.
- Application-owned Bakersfield zones provide durable coarse public markers.
- Exact markers require fresh authorized provider evidence and current
  publication-release authority.
- List and map remain two projections of the same `/search` contract.
- List view remains useful without Google and never downloads its runtime.
- All Google work stays blocked until the legal, storage, credential, public
  zone, and operational gates pass.

## 3. Audit inventory

### Location boundary and organizer workflow

| File                                                               | Current responsibility                                    | Conditional change                                                                                      |
| ------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/modules/locations/application/location-provider.ts`           | One `validate(LocationInput)` port                        | Replace with provider-neutral selection/evidence contracts; preserve domain ownership                   |
| `src/modules/locations/domain/types.ts`                            | Input and always-complete validated result                | Add confirmation, provenance, nullable evidence, retrieval, and expiry concepts                         |
| `src/modules/locations/domain/errors.ts`                           | Not-found/provider errors                                 | Add stable selection, stale-evidence, and provider-unavailable codes                                    |
| `src/modules/locations/infrastructure/configured-location.ts`      | Select Test fixture or Mapbox                             | Select fake adapters in tests and conditional Google browser workflow after approval                    |
| `src/modules/locations/infrastructure/mapbox-location-provider.ts` | Server Mapbox forward geocoding                           | Retain until migration acceptance, then remove in a dedicated cleanup commit                            |
| `src/modules/locations/infrastructure/test-location-provider.ts`   | Deterministic Bakersfield result                          | Evolve into deterministic selection/evidence fixtures without network calls                             |
| `src/app/api/events/[eventId]/location/route.ts`                   | Authenticated, trusted-origin PUT                         | Split draft address save from explicit location confirmation without weakening ownership/version checks |
| `src/modules/events/application/schemas.ts`                        | Structured address, privacy, timezone, version validation | Add bounded selection token/evidence reference, confirmation action, and public-zone selection          |
| `src/modules/events/application/event-service.ts`                  | Calls provider then saves a verified location             | Persist unconfirmed drafts; authorize confirmation; invalidate on material changes                      |
| `src/modules/events/application/policy.ts`                         | Readiness and public address projection                   | Require fresh confirmation/evidence for exact publishing and a public zone for protected modes          |
| `src/modules/events/application/approval.ts`                       | Hashes current private provider evidence                  | Hash stable location identity/public-zone decisions, excluding refresh timestamps                       |
| `src/modules/events/application/ports.ts`                          | Repository update with a complete validated result        | Accept first-party state and evidence as separate records                                               |
| `src/modules/events/domain/types.ts`                               | Location/editor/readiness/public-address DTOs             | Represent explicit confirmation/evidence freshness while keeping exact data out of public DTOs          |
| `src/modules/events/infrastructure/prisma-event-repository.ts`     | Atomic event and location upsert, PostGIS point, audit    | Write separate first-party/evidence rows and redact audit metadata                                      |
| `src/app/_components/event-builder.tsx`                            | Five-step form including structured address fields        | Add lazy Places selection, confirmation map, public-zone selection, and provider failure recovery       |

### Persistence and publication

| File                                                                  | Current responsibility                                        | Conditional change                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                                | `Event`, `EventLocation`, PostGIS point, publication snapshot | Add confirmation/provenance/evidence/public-zone model only after schema approval |
| `prisma/migrations/20260721000000_phase3_event_builder/migration.sql` | Original event/location tables and GIST index                 | Historical migration; never edit                                                  |
| `src/modules/payments/application/publication.ts`                     | Immutable publication snapshot creation/parsing               | Extend only with an approved public-location reference/projection                 |
| `src/modules/payments/application/eligibility.ts`                     | Payment/publication readiness authority                       | Block unconfirmed, stale, or privacy-incomplete locations                         |
| `src/modules/payments/application/payment-service.ts`                 | Webhook-authoritative publication/recovery                    | Recheck evidence freshness and projection authority at fulfillment                |
| `src/app/_components/public-event-listing.tsx`                        | Public listing rendering                                      | Omit directions when exact evidence is absent/stale                               |
| `src/app/dashboard/events/[eventId]/preview/page.tsx`                 | Exact revision preview                                        | Distinguish first-party address from provider confirmation/freshness              |
| `tests/integration/phase3-event-builder.test.ts`                      | Event/location/PostGIS workflow                               | Add first-party/evidence and expiry cases                                         |
| `tests/integration/phase4-paid-publication.test.ts`                   | Publication/privacy/search integration                        | Add stale, zone, release, and cleanup cases                                       |
| `tests/unit/events/policy.test.ts`                                    | Privacy projection behavior                                   | Add confirmation and public-zone invariants                                       |
| `tests/unit/payments/eligibility-and-publication.test.ts`             | Payment/publication authority                                 | Prove stale/unconfirmed evidence fails closed                                     |

### Shared public search and map

| File                                                                          | Current responsibility                    | Conditional change                                                           |
| ----------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| `src/modules/public-search/domain/types.ts`                                   | Criteria, list card, result page          | Add provider-neutral bounds and narrow marker DTO                            |
| `src/modules/public-search/application/criteria.ts`                           | First-value query normalization           | Reject duplicates/unknowns and enforce bounded input                         |
| `src/modules/public-search/application/date-range.ts`                         | Bakersfield calendar intervals            | Retain Friday-Sunday weekend behavior; cap custom ranges at 31 days          |
| `src/modules/public-search/application/ports.ts`                              | List repository port                      | Add explicit list/map projection requirements without leaking provider types |
| `src/modules/public-search/application/public-search-service.ts`              | Paid snapshot cards and cursors           | Produce identity-matched list and map pages with privacy-safe geometry       |
| `src/modules/public-search/infrastructure/prisma-public-search-repository.ts` | Paid/active Bakersfield publication query | Query public zones for protected markers; never private exact points         |
| `src/app/api/search/route.ts`                                                 | JSON list endpoint and map `503`          | Normalize first, rate-limit, then return list or marker projection           |
| `src/app/search/page.tsx`                                                     | Server-rendered search route              | Keep list SSR; lazy-load map only for `view=map`                             |
| `src/features/search/search-controls.tsx`                                     | Sale/date/view URL controls               | Add bounded bounds and explicit “Search this area” state                     |
| `src/features/search/search-results.tsx`                                      | Result/empty/error/list handling          | Add map-unavailable fallback without hiding the list                         |
| `src/features/search/listing-card.tsx`                                        | Privacy-safe list card                    | Reuse identity/selection state with marker previews                          |
| `tests/unit/public-search/criteria.test.ts`                                   | Query normalization                       | Add duplicate/unknown/length/range/bounds rejection                          |
| `tests/unit/public-search/public-search-service.test.ts`                      | Cards/cursors/privacy                     | Add marker parity and anti-triangulation cases                               |
| `tests/e2e/public-marketplace.spec.ts`                                        | Public marketing/search journey           | Add responsive map, failure, focus, and network assertions                   |

### Security, configuration, and operations

| File                                                                    | Current responsibility                         | Conditional change                                                                          |
| ----------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/platform/config/env.ts`                                            | Four-environment validation and Mapbox pairing | Recognize the approved Google public variables and validate presence without logging values |
| `.env.example`                                                          | Checked-in variable names/examples             | Document names only in the implementation commit; never commit values                       |
| `next.config.ts`                                                        | Static global CSP and security headers         | Move Google routes to nonce CSP without broadening unrelated routes                         |
| `src/platform/seo/indexing-policy.ts`                                   | Beta/sensitive route noindex                   | Preserve current fail-closed noindex behavior                                               |
| `src/modules/auth/infrastructure/hmac-privacy-fingerprint.ts`           | HMAC client identity                           | Extract a provider-neutral client-fingerprint port                                          |
| `src/modules/auth/infrastructure/prisma-authentication-rate-limiter.ts` | Durable PostgreSQL fixed-window limiter        | Reuse behind a neutral boundary for public search                                           |
| `tests/integration/authentication-rate-limits.test.ts`                  | Limiter database behavior                      | Extend neutral limiter evidence without weakening auth tests                                |
| `tests/unit/platform/environment.test.ts`                               | Environment invariants                         | Add Google name/presence/restriction-marker tests as approved                               |
| `tests/unit/platform/next-config.test.ts`                               | Security-header assertions                     | Add nonce and route-scope CSP coverage                                                      |
| `docs/operations/*`                                                     | Provider/deployment runbooks                   | Use stable Production-beta workflow; preserve historical phase evidence                     |

### Documents that remain historical

Do not revise ADR 008, the Phase 1 frozen/checksummed roadmap, completed phase
acceptance/security/testing reports, or historical migration records. They
describe decisions and evidence at the time. Active documentation may link to
this handoff and explicitly distinguish historical Preview code paths from the
approved current hosted workflow.

## 4. Current contracts and gaps

### Current location input and result

`eventLocationSchema` currently accepts:

- `expectedVersion`
- `addressLine1`
- optional `addressLine2`
- `city`
- `region`
- `postalCode`
- two-letter `countryCode`
- `timezone`
- `privacyMode`

`ValidatedLocation` always requires:

- normalized structured address
- exact latitude and longitude
- IANA timezone copied from input
- provider Place ID and provider name
- optional precision and confidence
- `VERIFIED` or `LOW_CONFIDENCE`

This shape cannot represent a Google outage draft, explicit organizer
confirmation, stale evidence, a resolution source, or an approved public zone.
It also conflates first-party organizer input with provider content.

### Current persistence

`EventLocation` requires structured and normalized address fields,
latitude/longitude, provider Place ID/name, timezone, and validation state.
`coordinates geography(Point, 4326)` is nullable in Prisma but the repository
always populates it. The Phase 3 migration adds a GIST index. There is no
retrieval time, expiry, confirmation actor/time, provenance, or cleanup state.
The persisted address is the current provider-normalized validation result; the
original organizer submission is not retained separately and must not be
reclassified as durable organizer-authored data during migration.

The approval digest currently includes normalized address, fixed-six-decimal
coordinates, provider identity, and validation state. Any schema redesign must
preserve exact-revision authority while preventing routine evidence refresh
from invalidating approval.

### Current privacy and publication

At projection time:

- `EXACT_ADDRESS` includes full structured address.
- `APPROXIMATE_LOCATION` includes city/region/country and
  `Near Bakersfield, CA`.
- `HIDDEN_UNTIL_START` includes city/region until authoritative server time
  reaches `startsAt`, then includes full structured address.

Publication snapshots contain the approved projection and are immutable.
Search reads those snapshots, rejects canceled/removed records, requires an
active end time, filters Bakersfield, and orders by start time/public ID.
There is no public geometry in the snapshot or search DTO.

### Current search

- Default list limit is 12; the service caps requested limits at 24.
- URL criteria are `sale`, `date`, `from`, `to`, `view`, and `cursor`.
- Location is fixed to `bakersfield-ca`; sort is fixed to `soonest`.
- `Today`, `This Weekend`, `Next 7 Days`, and custom dates use
  `America/Los_Angeles`.
- `This Weekend` correctly resolves Monday-Thursday to the coming
  Friday-Sunday, Friday to Friday-Sunday, Saturday to Saturday-Sunday, and
  Sunday to Sunday.
- Custom ranges validate ordering but do not yet enforce a 31-day maximum.
- Duplicate keys use the first value and unknown keys are ignored.
- Cursor syntax is capped at 500 characters and decoded cursors are bound to
  sale/date/location/sort criteria.
- List DTOs expose privacy-safe labels and no geometry.
- The map projection deliberately fails closed.

## 5. Google policy and architecture gates

These are implementation blockers, not optional risk notes:

| Gate                           | Evidence required                                                                                        | Blocking reason                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Listings/directory eligibility | Written Google Maps Platform or qualified legal confirmation                                             | Non-EEA Terms section 3.2.3(d)(iii) identifies listings/directory use as prohibited      |
| Storage and reuse              | Written treatment of selected Place fields, exact coordinates, PostGIS, snapshots, display, and deletion | Places/Geocoding content is restricted; latitude/longitude ordinarily has a 30-day limit |
| Billing region                 | Confirm billing address is outside EEA                                                                   | Terms and product behavior differ by billing region                                      |
| Credential posture             | Verify website and API restrictions without printing values                                              | One key cannot safely mix browser and server restriction types                           |
| Public zones                   | Approved dataset, license, service envelope, stable version                                              | Zones must be application-owned and must not be derived from Google content              |
| CSP/attribution/legal copy     | Reviewed CSP, visible attribution, Terms and Privacy disclosure                                          | Required before any Google content is shown                                              |
| Cost controls                  | Quotas, endpoint alerts, and billing alerts                                                              | Browser credentials and map interactions create direct billable exposure                 |

The source of truth at implementation time is the current text of:

- [Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms)
- [Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)
- [Places policies and attribution](https://developers.google.com/maps/documentation/places/web-service/policies)
- [API-key security guidance](https://developers.google.com/maps/api-security-best-practices)

If written approval is denied or narrower than this design, stop and reopen
provider selection. Do not attempt to interpret organizer confirmation,
application-owned address fields, or a private PostGIS table as an automatic
exception.

## 6. Conditional target interfaces

Names are planning-level and may be refined without changing the behavior.
Google types must not cross infrastructure adapters.

```ts
type LocationConfirmationState = "UNCONFIRMED" | "CONFIRMED" | "STALE";

type LocationResolutionSource =
  "ORGANIZER_PLACE_SELECTION" | "ADMIN_GEOCODING" | "LEGACY_PROVIDER";

interface OrganizerAddress {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  timezone: string;
}

interface LocationConfirmation {
  state: LocationConfirmationState;
  confirmedAt: string | null;
  confirmedByUserId: string | null;
  publicZoneId: string | null;
}

interface ProviderLocationEvidence {
  provider: "google" | "mapbox-legacy";
  providerVersion: string;
  providerPlaceId: string | null;
  resolutionSource: LocationResolutionSource;
  latitude: number | null;
  longitude: number | null;
  retrievedAt: string;
  expiresAt: string;
  placeIdRefreshedAt: string | null;
  resolvedByAdministratorId: string | null;
}
```

The organizer enters or edits the durable structured address in
application-owned fields. The selected Google formatted address and components
are transient comparison/display content and may not silently populate or
overwrite those fields. The browser-facing Place-selection payload must be
narrowly bounded and short-lived. The server must validate event ownership,
current event version, trusted origin/CSRF controls, confirmation action,
selected public zone, coordinate ranges, age, and replay properties before it
changes application state. The authenticated request is `no-store`, is never
echoed, and its address, Place ID, and coordinate fields are never logged.
Browser payload presence is not provider authenticity.

### Organizer endpoints

Plan two distinct transitions:

1. **Save address draft**
   - Persists only organizer-entered application fields, with
     application-defined syntactic normalization, plus privacy/public-zone
     choice.
   - Marks confirmation `UNCONFIRMED`.
   - Allows Google-unavailable recovery.
   - Invalidates approval when address, privacy, or public zone materially
     changes.

2. **Confirm selected location**
   - Requires an authenticated owner, trusted origin/CSRF protection,
     optimistic version, a fresh bounded selection, the organizer's explicit
     attestation that the transient provider display corresponds to the current
     application-owned address, and a confirmation action.
   - Writes `CONFIRMED` application state and provider evidence atomically.
   - Never trusts a role, event owner, provider name, or confirmation state
     supplied only by the browser.

An administrator-only fallback uses a distinct authorization boundary and
audit action. It cannot share the ordinary organizer endpoint.

### Public marker contract

```ts
interface PublicMapMarkerProjection {
  id: string;
  href: string;
  saleType: "estate" | "yard";
  title: string;
  startsAt: string;
  endsAt: string;
  locationLabel: string;
  coverPhotoUrl: string;
  geometry: {
    latitude: number;
    longitude: number;
  };
  markerKind: "exact" | "approximate" | "hidden";
}

interface PublicSearchMapPage {
  schema: "public-search-v2";
  criteria: PublicSearchCriteria;
  itemIds: readonly string[];
  markers: readonly PublicMapMarkerProjection[];
  pageInfo: {
    hasNext: boolean;
    nextCursor: string | null;
  };
}
```

The API may evolve the schema version once rather than silently adding
geometry to `public-search-v1`. `itemIds` must match the ordered list projection
for the loaded page. Every marker must reference one of those IDs, but markers
are a subset when an item has no authorized public geometry. In particular, a
marker may be omitted when exact evidence is stale and no privacy-safe
public-zone geometry is authorized; the list item remains available.

The marker DTO must not include:

- address line or unit
- postal code
- Place ID
- provider payload or attribution metadata
- source publication snapshot
- private location/evidence identifiers
- organizer account/contact data
- approval or payment fields
- private exact coordinates for approximate/hidden states

## 7. Schema and migration design

No schema edit is authorized yet. After legal/storage approval, use one
forward-only migration reviewed independently.

### Event location

Retain one event-owned first-party row, but change its semantics:

- Only organizer-entered application address fields and IANA timezone are
  durable.
- `confirmation_state`, `confirmed_at`, and `confirmed_by_user_id` are
  explicit.
- `public_zone_id` references a durable application-owned zone.
- Provider-derived normalized address, exact coordinate, provider identity,
  precision, confidence, and validation state move out.
- Address fields remain private and must not appear in routine audit metadata.

### Provider evidence

Add a one-to-one current-evidence record:

- event/location foreign key with cascade behavior matching location ownership
- provider and provider version
- nullable provider Place ID
- resolution source
- nullable latitude and longitude
- nullable PostGIS `geography(Point, 4326)`
- `retrieved_at`
- `expires_at`
- nullable `place_id_refreshed_at`
- nullable resolving administrator
- created/updated timestamps

Add checks for coordinate pairs, ranges, expiry ordering, and permitted
source/administrator combinations. Add a spatial index only if the approved
query plan needs exact geometry. Expiry cleanup must set/delete scalar
coordinates and PostGIS geometry together.

### Public zones

Add `PublicLocationZone` with:

- stable ID and slug
- public label
- application-owned coarse centroid
- service-area bounds or approved geometry only if independently licensed
- source/license identifier and version
- active state and timestamps

The approved dataset is seeded through a reviewed, deterministic migration or
operational import. It may not be built from Google points, tiles, boundaries,
or geocoding results.

### Migration behavior

1. Add nullable target columns/tables and constraints.
2. Backfill current Mapbox rows as `LEGACY_PROVIDER`.
3. Do not reclassify the currently stored Mapbox-normalized address as
   first-party organizer input. Retain it only under the approved legacy
   retention rule and require organizer re-entry or an authorized administrator
   transition before publication readiness.
4. Mark legacy confirmation/evidence stale unless an independently approved
   rule proves it fresh.
5. Never invent Google Place IDs.
6. Require a public-zone selection before protected legacy events can be
   republished.
7. Prevent payment/publication while target state is incomplete.
8. Validate counts, coordinate/geometry pairing, ownership, and approval
   behavior.
9. Only after the Google path is accepted and data migration is verified,
   remove obsolete Mapbox fields/configuration in a later commit.

Existing migration SQL is immutable. Rollback uses a new forward fix, not
editing or resetting applied migrations.

## 8. Retention and evidence lifecycle

The default policy remains conditional on written approval:

| Data                                            | Default lifecycle                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| First-party organizer address                   | Durable under application retention policy                           |
| Google Place ID                                 | May be retained; refresh when older than 12 months                   |
| Places-derived formatted address/components     | Transient display only; do not persist                               |
| Places-derived latitude/longitude/PostGIS point | Delete by 30 days after retrieval                                    |
| Admin Geocoding coordinate                      | Apply approved Geocoding terms and recorded expiry                   |
| Mapbox legacy evidence                          | Mark legacy/stale; retain only per approved migration/retention rule |
| Public-zone centroid                            | Durable application-owned dataset                                    |
| Search/publication marker                       | Generated from currently authorized evidence or public zone          |

A durable scheduled job must:

- find evidence approaching expiry
- refresh only through an approved interactive or server identity
- remove stale scalar and PostGIS coordinates atomically
- mark exact publication projection unavailable when refresh cannot occur
- leave first-party address and list result intact
- record counts/reason codes without locations
- use bounded retries, deduplication, stale-lock recovery, and current durable
  job infrastructure

Long-lived drafts and far-future events need an explicit refresh path before
preview/approval/payment/publication. A same-Place-ID refresh does not create a
material revision. A changed Place ID or address does.

## 9. Privacy-safe marker policy

| Privacy mode           | Before start                  | At/after start    | Stale exact evidence                       |
| ---------------------- | ----------------------------- | ----------------- | ------------------------------------------ |
| `EXACT_ADDRESS`        | Fresh exact point             | Fresh exact point | No exact marker/directions; keep list card |
| `APPROXIMATE_LOCATION` | Selected public-zone centroid | Same centroid     | Unaffected by exact expiry                 |
| `HIDDEN_UNTIL_START`   | Selected public-zone centroid | Fresh exact point | Zone centroid or omit exact marker         |

Authoritative server time, not browser time, controls release. Canceling,
removing, or expiring a listing removes exact public geometry immediately.
Publication snapshots and runtime projection must not allow an old exact point
to survive a privacy-mode or lifecycle transition.

### Public-text leak protection

Before protected-mode preview and approval:

- Normalize the private house number and street tokens.
- Compare them with normalized title and description text.
- Recognize common street suffix and unit variations.
- Block only a matching house-number/street combination to reduce false
  positives.
- Return a generic field error that does not echo the private address.
- Do not log match text, private tokens, or the source field value.

This is a safeguard, not a replacement for excluding private fields from DTOs,
HTML, RSC payloads, metadata, JSON-LD, API responses, logs, telemetry, visual
snapshots, and cache keys.

## 10. Explore interaction and data flow

### List

- Server render the first result page where practical.
- Never load Google scripts, map CSS, tiles, Places, or coordinates in list
  view.
- Keep list cards, empty/error states, filters, dates, sort, and cursor usable
  when Google fails.
- Use `/search` for Explore and `/search?view=map` for Map.

### Map

- Dynamically load Maps JavaScript only for `view=map`.
- Use `AdvancedMarkerElement` with the approved JavaScript Map ID.
- Desktop: synchronized list/map split after the current responsive
  breakpoint.
- Mobile: full-height map with safe-area-aware controls and an accessible
  listing-preview bottom sheet.
- Selecting a card selects/pans to the matching marker; selecting a marker
  opens the preview for the same listing ID.
- A card without authorized public geometry remains usable but does not pan the
  map. It exposes an accessible "Map location unavailable" status instead of a
  fabricated marker.
- Closing a marker preview returns focus to its marker trigger.
- Panning/zooming changes only local viewport state until the user activates
  “Search this area.”
- Clusters represent only the loaded page and must not imply all inventory in
  the viewport.
- Use standard Google Maps URLs for directions only when exact public
  geometry is authorized.

### Map failure

- Show one concise map-unavailable status.
- Offer a visible “View list” action preserving filters.
- Preserve the server-rendered result list and shareable URL.
- Do not retry in a render loop.
- Distinguish missing config, unauthorized referrer, invalid Map ID, CSP,
  quota/billing, script-load, and data-response failures in sanitized internal
  reason codes.

## 11. Query validation, rate limits, and anti-triangulation

Normalize and reject before repository access:

- unknown parameters
- duplicate parameters
- invalid enum values
- malformed or over-length strings
- custom ranges over 31 calendar days
- cursors over 500 characters or bound to different criteria
- out-of-envelope, inverted, non-finite, or excessively narrow bounds
- page sizes above 24

Supported launch query state is sale type, date preset/range, Bakersfield
location, soonest sort, list/map view, opaque cursor, and approved bounds.
There is no radius, distance, neighborhood, ZIP, keyword, category, price, or
all-viewport aggregation filter.

Initial durable thresholds:

- list: 60 requests per privacy-safe client fingerprint per 60 seconds
- map: 20 requests per privacy-safe client fingerprint per 60 seconds

Return `429` with `Retry-After` when exceeded and `503` when the durable limiter
is unavailable. Extract the HMAC fingerprint and PostgreSQL limiter behind a
neutral platform port; do not make public search depend on authentication
application services.

Anti-triangulation invariants:

- Protected listings enter bounds queries through public-zone geometry only.
- Exact private points never influence protected inclusion, ordering, counts,
  pagination, clustering, or cache keys.
- Bounds cannot be narrower than the smallest approved public zone.
- Repeated overlapping queries return stable zone-based behavior.
- Distance labels and distance sorting do not launch.
- Error shape and timing must not reveal whether a protected point was inside a
  rejected micro-bound.

## 12. Credentials and environment

The product owner reports existing hosted variables:

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`

The audit found no checked-in validation or example declaration for them.
Implementation must validate presence and pairing without logging their values.

Required credential checks:

- Website restrictions include only approved localhost development origins,
  `https://estate-sales-bakersfield.vercel.app`, and the future approved custom
  domain.
- API restrictions include only Maps JavaScript API, Places API (New), and the
  Cloud Console `Geocoding API` required by the approved Maps JavaScript
  Geocoding Service flow.
- Usage metrics show browser JavaScript traffic only.
- The Map ID is a JavaScript Map ID and Advanced Markers is enabled.
- No server code sends this public key to Google web-service REST endpoints.

The one-key decision is compatible only with browser traffic. If a future
background refresh or server Geocoding call is required, stop for approval of
a separate server identity; Google documents that one key cannot properly
secure mixed website and web-service traffic.

No key value, Map ID value, provider response, address, coordinate, or Place ID
may be printed by verification scripts or included in CI artifacts.

## 13. CSP, attribution, and legal surface

Google routes require a nonce-based policy through Next.js `proxy.ts` or the
current framework-equivalent request boundary:

- Apply it only to `/search` map responses and builder location routes.
- Populate matching nonces for script and style.
- Add only Google's documented `script-src`, `connect-src`, `img-src`,
  `style-src`, `font-src`, `frame-src`, and `worker-src` origins.
- Preserve `object-src 'none'`, base/form/frame protections, HTTPS upgrade,
  current referrer rules, and route-specific no-store behavior.
- Do not globally wildcard Google domains or make all public marketing pages
  dynamic.
- Add automated assertions that list view does not reference Google.

Google attribution and any third-party attribution must remain visible,
readable, and outside frosted overlays that could obscure it. Public Terms and
Privacy pages must disclose Google Maps use and link to Google Maps end-user
terms and Google Privacy Policy before hosted use.

Redact the following across logger, Sentry, errors, request metadata, analytics,
screenshots, and snapshots:

- API key and signed/provider URLs
- first/second address lines and postal code
- latitude/longitude and PostGIS text
- Place ID and raw provider response
- normalized leak-detection tokens

## 14. Cost and observability

Before Production-beta use:

- Set per-API quotas and conservative request caps for Maps JavaScript,
  Places, and Geocoding.
- Configure usage alerts for unexpected endpoint volume, rejection rate, and
  quota pressure.
- Configure billing alerts at 50%, 80%, 90%, and 100% of the approved monthly
  budget.
- Document that budget alerts do not stop charges.
- Alert on map script failures, Place selection failures, confirmation
  failures, stale evidence, cleanup failure, and map-projection `503`.
- Keep metrics bounded to request category, outcome/reason code, duration,
  application environment, and aggregate counts.

Never include search text, addresses, coordinates, Place IDs, listing titles,
or account identity in Google cost telemetry.

## 15. Testing strategy

Ordinary CI uses fake Google adapters and makes no Google network calls.

### Unit

- Places selection field minimization and session lifecycle.
- Stale autocomplete request cancellation.
- Draft, confirmation, changed-address, changed-Place-ID, and same-Place-ID
  refresh transitions.
- Evidence expiry and confirmation-state computation.
- Approval digest excludes retrieval/expiry timestamps.
- Exact/approximate/hidden marker rules at time boundaries.
- Protected title/description leak detection and false-positive cases.
- Strict query duplicates, unknowns, limits, ranges, cursor binding, and
  bounds.
- Rate-limit response and fail-closed behavior.
- CSP composition and list-view Google absence.

### Integration

- Persist unconfirmed drafts with nullable evidence.
- Atomically confirm organizer selection with ownership and optimistic
  versioning.
- Reject stale/replayed/mismatched selection data.
- Administrator-only fallback provenance and authorization.
- PostGIS/scalar coordinate pairing, expiry, purge, and refresh.
- Legacy Mapbox backfill without invented Place IDs.
- Changed address/privacy/public zone invalidates approval.
- Same-Place-ID refresh keeps approved revision/digest.
- Payment and fulfillment block unconfirmed/stale exact location.
- Publication list and map use paid immutable snapshots and the same ordered
  IDs.
- Cancellation/removal/end-time and hidden-release transitions remove exact
  geometry.
- Repeated bounds cannot triangulate protected points.
- Limiter concurrency, expiry, isolation, maintenance, and unavailable
  database.

### Contract

- Fake Places/Geocoding adapters satisfy provider-neutral ports.
- Optional controlled live checks verify allowed fields, attribution, Map ID,
  origin restrictions, and sanitized failures without asserting provider
  values.
- Map DTO schema rejects private fields and provider SDK types.
- Standard Maps URL generation contains only publicly authorized destination
  data.

### End-to-end and accessibility

At 360, 390, 430, 768, 1280, and 1440px:

- Complete address selection, pin confirmation, rejection, reselection, and
  Google-unavailable draft recovery.
- Use address step and map with keyboard and screen reader.
- Preserve visible focus, error-summary/first-invalid focus, 48px targets,
  reduced motion, reduced transparency, and safe areas.
- Verify no horizontal overflow.
- Verify list-first mobile behavior, map/list switching, card-marker
  synchronization, “Search this area,” bottom-sheet focus trapping/return, and
  map fallback.
- Assert list view makes no Google requests.
- Assert no private address/coordinate/Place ID in public API responses, HTML,
  RSC payloads, metadata, JSON-LD, logs, screenshots, or snapshots. The
  authenticated confirmation request may carry the minimum bounded selection
  fields over same-origin TLS, but it is `no-store`, CSRF/origin protected,
  never echoed, and never logged.
- Verify Production-beta noindex and sensitive-route `noindex,nofollow`.

Do not compare live Google tiles pixel-for-pixel. Use a deterministic fake map
surface for visual regression and semantic assertions for the controlled live
smoke.

## 16. Implementation phases and stop conditions

### Phase A: eligibility and provider configuration

Deliver:

- written legal/provider confirmation
- approved retention matrix
- verified non-EEA billing posture
- verified browser key restrictions and Map ID
- approved public-zone dataset/license
- CSP, attribution, Terms/Privacy, quota, and budget plan

**Stop:** no code or schema work until every item is approved.

### Phase B: domain and forward migration

Deliver:

- confirmation/provenance/evidence/public-zone contracts
- forward-only schema migration
- deterministic Bakersfield public zones
- legacy Mapbox backfill and cleanup plan
- expiry job and approval-digest compatibility
- fake adapters and unit/integration coverage

**Stop:** independent schema, privacy, and migration review; do not remove
Mapbox.

### Phase C: organizer Places workflow

Deliver:

- lazy Places widget
- minimum-field selection
- explicit non-draggable pin confirmation
- unconfirmed provider-outage drafts
- public-zone selection
- administrator-only interactive Geocoding fallback
- mobile/accessibility/failure-state tests

**Stop:** owner review at 360-430px and security review of server authority,
credentials, attribution, and redaction.

### Phase D: shared `/search` map

Deliver:

- strict criteria and durable public-search rate limit
- list/map v2 projection and privacy-safe marker DTO
- lazy Maps JavaScript runtime and Advanced Markers
- card/marker synchronization, clusters, bounds, “Search this area”
- mobile listing-preview sheet and list fallback
- anti-triangulation, performance, and accessibility evidence

**Stop:** privacy, query-plan, bundle/network, and visual review. Any new map
loader or clustering dependency needs explicit approval.

### Phase E: operations and provider removal

Deliver:

- route-scoped nonce CSP
- public legal copy and attribution
- quotas, alerts, redaction, expiry operations, and live smoke procedure
- removal of obsolete Mapbox code/variables only after migration proof
- active Production-beta runbooks

**Stop:** complete local verification and explicit approval before promotion.

### Phase F: Production-beta validation

Workflow:

1. Work only on `feature/ui-ux-overhaul`.
2. Run complete local verification and review the exact diff.
3. Fast-forward `main` only with explicit approval; do not merge-commit or
   force-push.
4. Allow only `main` to deploy to the stable Production beta.
5. Verify deployment readiness, `/api/health`, noindex, authentication,
   organizer flow, search/map, responsive layouts, keyboard/focus, overflow,
   provider failures, privacy, and sanitized logs.

**Stop:** do not enable indexing or begin public launch.

## 17. Proposed commit boundaries

Keep commits reviewable and never mix provider resources with application
logic:

1. `docs: record conditional Google Maps architecture`
   - ADR 012, this handoff, active UI/UX plan.
2. `docs: align Production beta operations`
   - Active runbooks only; preserve historical evidence.
3. `feat: add provider-neutral location evidence model`
   - Domain types, ports, schema migration, public zones, fake adapters.
4. `feat: add confirmed Places location workflow`
   - Organizer UI/API, confirmation, provider failure, admin fallback.
5. `feat: add privacy-safe shared search map`
   - Search validation/limits, marker projection, map UI/adapters.
6. `chore: enforce Google security and operations`
   - CSP, redaction, legal copy, monitoring docs/tests.
7. `chore: remove retired Mapbox integration`
   - Only after data/provider acceptance and rollback review.

Each commit must pass focused tests, `pnpm exec prettier --check`, lint,
typecheck, architecture checks, `git diff --check`, and relevant integration
tests. No commit changes provider credentials or Production resources.

## 18. Risks and required responses

| Risk                                          | Required response                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| Google rejects directory use                  | Stop and reopen provider selection                                                |
| Written storage rights are narrower           | Redesign retention/projection before schema work                                  |
| One key is used by server REST traffic        | Block release; request a separately approved server identity                      |
| Expired exact coordinates remain queryable    | Fail publication/map exact projection and run cleanup                             |
| Protected listing can be triangulated         | Remove private-point influence and repeat privacy tests                           |
| Google outage blocks all search               | Keep SSR list independent and show map fallback                                   |
| Places content is persisted accidentally      | Add type, repository, log, and response allowlists                                |
| Attribution is obscured by glass UI           | Adjust layout; attribution visibility is non-negotiable                           |
| Map bundle harms mobile list                  | Assert zero Google network/runtime in list view                                   |
| Cost rises unexpectedly                       | Quotas, endpoint alerts, budget alerts, and kill-switch procedure                 |
| Legacy Preview docs are mistaken for workflow | Active docs state Production-beta-only hosting; historical records remain labeled |
| Address appears in seller-authored text       | Block protected-mode preview/approval with redacted validation                    |
| Provider refresh invalidates paid approval    | Keep retrieval timestamps outside the approval digest                             |

## 19. Deferred work

The following remain out of scope: Address Validation, Roads, Places UI Kit,
Routes, Directions API, Distance Matrix, Map Tiles, Street View, Aerial View,
unrestricted pin dragging, browser geolocation persistence, radius search,
distance sorting, all-viewport aggregation, and Plan My Route.

No Google implementation begins until ADR 012's written provider-eligibility
and storage gates are satisfied.
