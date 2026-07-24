# ADR 012: Google Places selection, confirmed locations, and Explore maps

Status: conditionally accepted — implementation blocked

## Context

The application currently resolves organizer-entered addresses through a
server-only Mapbox Geocoding v6 adapter. The resulting normalized address,
provider identity, latitude/longitude, and PostGIS point are stored without an
expiry in the event-owned `event_locations` row. ADR 008 established the
provider-neutral `LocationProvider` boundary, IANA-timezone behavior, PostGIS
boundary, and the `EXACT_ADDRESS`, `APPROXIMATE_LOCATION`, and
`HIDDEN_UNTIL_START` public projections.

The public `/search` list is now backed by immutable paid publication
snapshots. No browser map SDK is installed, and `projection=map` deliberately
returns `503 MAP_PROJECTION_UNAVAILABLE`. Google Maps Platform is the intended
provider for the future organizer address-selection and shared Explore map
experience, but it is not the current runtime.

Google's non-EEA Maps Platform Terms prohibit using Google Maps Core Services
in a listings or directory service. The same terms restrict deriving
application content from Google Maps content. Service-specific terms ordinarily
allow Places-derived and Geocoding-derived latitude/longitude to be cached for
only 30 consecutive calendar days. Google documents Place IDs as exempt from
Places caching restrictions, and recommends different restricted credentials
for browser and server traffic. These constraints conflict with the proposed
estate-sale directory, the current indefinite PostGIS storage model, and an
all-in-one browser/server credential.

No implementation is authorized until Google Maps Platform or qualified legal
counsel provides written confirmation that covers the proposed use and
retention model.

## Decision

Conditionally select Google Maps Platform to replace Mapbox after all approval
gates in this ADR pass. The launch scope is:

- Maps JavaScript API for the organizer confirmation map and `/search` map
  view.
- Places API (New), preferably `PlaceAutocompleteElement`, for primary
  organizer address selection.
- The Maps JavaScript Geocoding Service only in an authenticated,
  administrator-controlled fallback for imported, legacy, or unresolved
  records.
- Standard Google Maps URLs for directions; Routes API is not enabled.

Mapbox remains the current runtime until an approved migration is implemented.
This ADR supersedes only ADR 008's choice of Mapbox as the provider. ADR 008's
provider boundary, private-location separation, timezone rules, PostGIS
boundary, and privacy projections remain authoritative unless a later ADR
explicitly changes them.

### Organizer selection and confirmation

The primary location flow will:

1. Load the Places library only on the Address and Privacy builder step.
2. Restrict suggestions to the United States and bias them to the approved
   Bakersfield service envelope.
3. Retrieve only `id`, `formattedAddress`, `addressComponents`, and `location`
   for the selected Place.
4. Display Google-provided content transiently with required attribution.
5. Show the selected point on a Google map with a non-draggable pin.
6. Require the organizer to confirm the displayed address and pin or return to
   search.
7. Submit the confirmation to a server-authorized application transition.
8. Require a new Place selection and confirmation whenever the address
   changes.

The durable structured address comes from application-owned fields that the
organizer enters or edits before selection. Only application-defined syntactic
normalization, such as trimming and country/region casing, may be applied before
those submitted values are stored. Google `formattedAddress` and
`addressComponents` are transient comparison/display content: they must not
silently populate or overwrite the durable address. A mismatch returns the
organizer to the application-owned fields and requires a new selection.

The UI must say that the organizer confirmed the location. It must not claim
that untrusted browser data is "Google verified." The managed widget session
lifecycle is preferred. A custom autocomplete implementation is permitted only
if it uses a unique session token per selection attempt, cancels stale
requests, requests the minimum fields, preserves Google attribution, and meets
the same keyboard and screen-reader requirements.

If Google is unavailable, the organizer may save first-party address fields as
an unconfirmed draft and continue unrelated steps. The application must not
fabricate a Place ID or coordinates. Approval, payment, and publication remain
blocked while the location is unconfirmed or stale. An existing confirmed
location remains usable through a temporary provider failure only until its
permitted coordinate cache expires.

### Controlled Geocoding fallback

The Geocoding fallback is not part of the normal organizer or public Explore
flow. It is available only in an authenticated administrator workflow for
imported, legacy, or unresolved locations. With the currently approved single
public credential, it must use the Maps JavaScript Geocoding Service
interactively and must not send that public key from the server to a Google REST
endpoint.

Every fallback resolution records its source, resolving administrator,
confirmation time, provider retrieval time, and expiry. Unattended batch
geocoding and server-side refresh are blocked unless a separately approved
server identity is introduced. Arbitrary organizer-entered text cannot become
publication-ready through this fallback.

### Application-owned location state

Durable first-party state and expiring provider evidence must be separate:

- `EventLocation` retains only the organizer-entered application fields, IANA
  timezone, privacy mode association, application confirmation, and selected
  public zone. Existing Mapbox-normalized address rows are legacy
  provider-derived data, not presumed organizer-authored data, and require
  re-entry and confirmation before a future publication-ready transition.
- Confirmation states are `UNCONFIRMED`, `CONFIRMED`, and `STALE`.
- Provider-evidence resolution sources are `ORGANIZER_PLACE_SELECTION`,
  `ADMIN_GEOCODING`, and `LEGACY_PROVIDER`.
- A one-to-one evidence record holds provider/version, Place ID, resolution
  source, exact coordinate/PostGIS cache, retrieval time, expiry, Place-ID
  refresh time, and resolving administrator where applicable.
- Provider evidence and exact coordinates are nullable, so a Google outage can
  still produce a valid unconfirmed draft.
- An application-owned `PublicLocationZone` dataset contains stable slugs,
  public labels, licensed source/version data, and coarse centroid geometry.

Approximate and hidden listings must use an organizer-selected, approved
Bakersfield public zone. A zone must never be derived by rounding, jittering,
offsetting, or applying point-in-polygon analysis to a Google coordinate.

Unless written authorization permits broader use:

- Place IDs may be stored indefinitely and are refreshed when older than 12
  months.
- Places-derived coordinates and their PostGIS point expire and are deleted no
  later than 30 days after retrieval.
- Google formatted addresses and address components are transient provider
  content, not durable application data.
- Pin confirmation does not convert Google content into unrestricted
  application-owned data.
- Expired coordinates are removed from spatial queries instead of remaining
  silently active.
- Existing Mapbox evidence migrates as legacy/stale evidence; migration must
  never invent a Google Place ID.

A changed address, Place ID, privacy mode, or public zone is a material event
change and invalidates approval. Refreshing evidence for the same Place ID is
non-material. Provider retrieval and expiry timestamps must not enter the
approval digest.

### Public list and map contract

`/search` remains the only results and map system. The same normalized
criteria, ordering, cursor, and listing IDs power both projections:

- `projection=list` returns listing cards without geometry and does not load
  Google scripts or tiles.
- `projection=map` returns the same listing identities plus a separate,
  privacy-safe marker collection.
- `PublicMapMarkerProjection` contains only public listing ID, canonical route,
  sale type, title, schedule, privacy-safe location label, authorized cover
  URL, authorized public geometry, and marker kind.
- It never contains private address fields, postal code, Place ID, provider
  response data, raw publication snapshots, payment state, or account data.
- Google SDK types remain inside browser infrastructure adapters.

Marker behavior is:

- `EXACT_ADDRESS`: project the exact point only when server-side publication
  rules permit release and the provider evidence is fresh.
- `APPROXIMATE_LOCATION`: use the approved public-zone centroid for the
  listing's entire public lifetime.
- `HIDDEN_UNTIL_START`: use the public-zone centroid before the authoritative
  start time, and a fresh exact point only after release is permitted.
- Stale evidence: omit the exact marker and directions link while keeping the
  list result available.
- Ended, canceled, removed, or expired listings: remove exact public geometry
  immediately.

For protected privacy modes, publication validation must reject a title or
description containing the matching house-number/street combination. Errors,
logs, and telemetry must not echo the private address.

The map remains list-first on mobile. `/search?view=map` lazily loads Google
Maps; desktop may use a synchronized split view, while mobile uses a full
height map and accessible listing-preview bottom sheet. Panning and zooming do
not run new queries until "Search this area" is activated. Clusters summarize
only the currently loaded result page.

### Search abuse and anti-triangulation

The SSR list and API share one strict normalization and abuse-control policy:

- Maximum page size: 24.
- Maximum custom date range: 31 calendar days.
- Allowed keys: approved sale type, date preset or range, Bakersfield
  locality, soonest sort, view, cursor, and valid map bounds.
- Reject duplicate, unknown, malformed, or over-length parameters before
  database work.
- Cap criteria-bound opaque cursors at 500 characters.
- Do not launch radius search, distance labels, or distance sorting.
- Constrain map bounds to the approved service envelope and do not accept
  bounds narrower than the smallest approved public zone.
- Start at 60 list requests and 20 map requests per privacy-safe client
  fingerprint per 60 seconds.
- Return `429` with `Retry-After`; return `503` if the durable limiter is
  unavailable.

The existing HMAC fingerprint and PostgreSQL limiter may be extracted behind a
provider-neutral platform port. Public queries, clusters, counts, pagination,
and cache keys for protected listings use only public-zone geometry; they must
never depend on the private exact point.

### Credentials, CSP, attribution, and cost

The initially approved configuration contains only
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. Their
presence and restrictions must be checked without printing values.

The browser key must use website restrictions for approved localhost origins,
the stable Production-beta origin, and a future approved custom domain. API
restrictions permit only Maps JavaScript API, Places API (New), and the Cloud
Console `Geocoding API` required by the Maps JavaScript Geocoding Service. The
public key is never used for server REST calls. The Map ID must be a JavaScript
Map ID with Advanced Markers enabled.
If a future server web service is required, the one-key constraint becomes an
approval blocker because browser and server traffic require incompatible
application restrictions.

Google routes will use a route-scoped, nonce-based CSP following Google and
Next.js guidance. The policy must allow only the documented Google script,
connection, image, style, font, frame, and worker sources needed by these
routes. Unrelated marketing pages remain statically renderable and do not gain
broad Google origins. Address, postal code, coordinate, Place ID, and API-key
redaction applies to logs, errors, telemetry, and snapshots.

Public Terms and Privacy pages must disclose Google Maps usage and link to the
required Google terms and privacy policy. Google and third-party attribution
provided by the services must remain visible and unobscured.

Before hosted use, configure per-API quotas and endpoint alerts, plus billing
alerts at 50%, 80%, 90%, and 100%. Budget alerts warn but do not cap spending.
Metrics contain request category, status, latency, and outcome only—never
addresses or coordinates.

## Approval gates

Implementation is blocked until all of the following are documented:

1. Written Google Maps Platform or qualified legal confirmation that the
   estate-sale listings/directory use is authorized.
2. Written retention and reuse guidance for selected Place content, exact
   coordinate display, PostGIS caching, publication snapshots, and the
   proposed 30-day lifecycle.
3. Confirmation that non-EEA terms govern the billing account.
4. Review of the one-browser-key architecture and acknowledgment that it does
   not authorize server REST traffic.
5. Verified website/API restrictions, Map ID capability, quotas, billing
   alerts, attribution, public legal copy, and CSP.
6. Approved public-zone dataset, licensing, service envelope, and
   anti-triangulation behavior.
7. Reviewed forward migration, stale-evidence cleanup, approval-digest
   compatibility, rollback posture, and fake-adapter test plan.

If the first two gates fail or materially narrow the design, reopen provider
selection instead of weakening privacy or silently violating the terms.

## Consequences

- Google Maps Platform is an intended, conditional architecture—not a claim
  about the live application.
- Mapbox code, variables, tests, and operational truth remain until a later
  approved migration removes them.
- Unconfirmed and stale locations become explicit application states.
- PostGIS exact points become expiring provider evidence, while public-zone
  geometry is durable application-owned data.
- List search remains functional when Google is unavailable.
- Protected locations cannot be triangulated through map queries or result
  counts.
- Ordinary automated tests use deterministic fake adapters and make no Google
  network calls.
- Production beta remains `noindex`; public launch remains a separate approval.

## Deferred

Address Validation, Roads, Places UI Kit, Routes, Directions API, Distance
Matrix, Map Tiles, Street View, Aerial View, unrestricted pin dragging, browser
geolocation persistence, radius search, distance sorting, all-viewport
aggregation, and Plan My Route are not part of this decision.

## References

- [Google Maps Platform Terms of Service](https://cloud.google.com/maps-platform/terms)
- [Google Maps Platform Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)
- [Places API policies and attribution](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Google Maps Platform API-key security guidance](https://developers.google.com/maps/api-security-best-practices)
- [Place Autocomplete widget](https://developers.google.com/maps/documentation/javascript/place-autocomplete-new)
- [Autocomplete data and session tokens](https://developers.google.com/maps/documentation/javascript/place-autocomplete-data)
- [Maps JavaScript API CSP guidance](https://developers.google.com/maps/documentation/javascript/content-security-policy)
- [Advanced Markers](https://developers.google.com/maps/documentation/javascript/advanced-markers/start)
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
- [Google Maps Platform cost controls](https://developers.google.com/maps/billing-and-pricing/manage-costs)
- [Next.js Content Security Policy guide](https://nextjs.org/docs/app/guides/content-security-policy)
