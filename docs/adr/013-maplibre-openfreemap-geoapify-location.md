# ADR 013: MapLibre, OpenFreeMap, Geoapify, and permanent PostGIS locations

**Status:** Accepted

**Date:** 2026-07-24

## Context

The organizer workflow needs structured address selection and a confirmation
map. Public discovery needs an interactive map without leaking protected
listing coordinates. The application already owns private event state,
publication snapshots, address-release policy, and a PostGIS location row.

ADR 008 selected Mapbox forward geocoding for the earlier server-only workflow.
ADR 012 conditionally proposed Google Maps Platform. The product owner has now
approved a different final provider architecture, so both provider choices are
superseded while their historical reasoning remains preserved.

## Decision

Use:

- **MapLibre GL JS** as the browser renderer for organizer confirmation and
  public Explore maps;
- **OpenFreeMap** as the launch style/tile provider, using
  `https://tiles.openfreemap.org/styles/liberty` by default;
- **Geoapify Address Autocomplete** behind an authenticated application
  endpoint for ordinary organizer selection;
- **Geoapify Forward Geocoding** only for imported or legacy data and
  authenticated administrator resolution;
- **Neon/PostGIS** as the permanent store for confirmed structured addresses,
  decimal coordinates, and geography points.

The browser never calls Geoapify and never receives `GEOAPIFY_API_KEY`. A
selected autocomplete result is normalized into an application-owned DTO and
signed by the server. Confirmation requires that signed selection. Ordinary
free-form organizer text can be stored only as an unconfirmed draft.

## Location authority

`EventLocation` records:

- structured first-party address fields;
- nullable latitude/longitude and PostGIS point for unconfirmed drafts;
- `UNCONFIRMED` or `CONFIRMED`;
- provider name, version, identifier, and attribution;
- resolution source;
- confirmation actor and time; and
- an application-owned public zone.

No raw provider response is retained. Existing verified Mapbox rows are marked
`LEGACY_PROVIDER` with truthful Mapbox provenance. They remain readable and are
not assigned Geoapify identifiers.

Normal selected autocomplete results already contain coordinates. Saving one
does not trigger a second geocoding call. An unchanged confirmed address is
reused without geocoding. Low-confidence results cannot make a listing
publication-ready.

## Public projection and privacy

MapLibre and GeoJSON types stop at the browser boundary. The public map receives
only the application-owned marker DTO:

- public listing ID and canonical route;
- sale type and public title;
- public schedule;
- privacy-safe location label;
- authorized cover image;
- approved point geometry; and
- marker kind.

Exact geometry is emitted only when the publication projection authorizes it.
Protected confirmed locations use the center of a fixed 0.01-degree neighborhood
cell. Nearby houses in that cell share the same public point and a 750-meter
area enclosing the cell. A broad map shows the point; neighborhood zoom shows
the shaded area with a dashed outline. Unconfirmed locations retain the public
zone centroid. Scheduled address hiding uses this protected geometry until the
organizer-selected release instant, then the confirmed exact point. Protected
bounds filtering uses the same public cell center, never the private point, so
narrowing a viewport cannot disclose more than the displayed neighborhood.

Title and description readiness also reject a normalized house-number and
matching-street leak for protected privacy modes. Errors do not echo the
address.

## Abuse, failure, and accessibility

- Autocomplete is authenticated, server-mediated, debounced, cancellable, and
  durably rate limited.
- Public list and map requests have separate durable limits and fail closed
  when limiting is unavailable.
- Search uses a strict allowlist, bounded cursors, bounded date/page ranges, and
  useful bounds inside the Bakersfield service area.
- Provider errors contain no query, coordinate, identifier, or key.
- Geoapify outage permits an unconfirmed draft and unrelated builder work, but
  blocks approval, payment, and publication.
- The organizer combobox supports keyboard and screen-reader interaction.
- Map failure leaves server-rendered listing results usable.
- List view does not receive marker geometry or request the map style.

## Attribution

Visible maps retain MapLibre/OpenFreeMap/OpenStreetMap attribution. Stored
Geoapify-derived locations retain source attribution. Public Terms and Privacy
summaries disclose Geoapify, OpenFreeMap, OpenStreetMap data, MapLibre, and
permanent confirmed-location storage.

## Environment

- `GEOAPIFY_API_KEY`: private, server-only, required in Production.
- `NEXT_PUBLIC_MAP_STYLE_URL`: public map-style URL, required in Production.

Google variables are not introduced. Mapbox configuration is removed only
after the migration, legacy-row compatibility, deterministic suites, build,
and hosted workflow pass verification.

MapLibre 6 requires an explicit worker URL when bundled by Next.js.
`prepare-maplibre-workers.ts` copies the installed version's worker and its
shared module into `public/maplibre/<version>/` before local development,
production builds, and isolated browser-test builds. Both map components use
that same-origin worker URL. Generated worker files are ignored by Git;
production start serves the files prepared during the build. This avoids Next
emitting a worker asset without the sibling module it imports. The public-map
browser test checks painted pin and neighborhood-circle pixels so a background
with a working keyboard list cannot pass as a rendered map.

## Consequences

- Interactive maps have one browser renderer and no React map wrapper.
- Provider payloads and keys remain infrastructure details.
- Public map output is derived from immutable publication authority plus safe
  location state.
- A later tile-provider change can use the same public style variable and map
  DTO without changing the event domain.
- A later Geoapify change can use the same autocomplete/geocoding ports without
  changing browser contracts.

## Supersedes

This ADR supersedes:

- ADR 008 only for the active Mapbox provider selection; and
- ADR 012 for the conditional Google provider selection and eligibility gates.

All other privacy, ownership, time, publication, and provider-boundary decisions
in those ADRs remain historical context unless explicitly changed here.

## References

- [MapLibre GL JS documentation](https://maplibre.org/maplibre-gl-js/docs/)
- [OpenFreeMap quick start](https://openfreemap.org/quick_start/)
- [Geoapify Address Autocomplete](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/)
- [Geoapify Forward Geocoding](https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/)
