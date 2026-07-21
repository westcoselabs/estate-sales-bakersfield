# ADR 008: Private location, time, and public projections

Status: accepted for Phase 3

## Decision

Store exact address, normalized provider identity, decimal coordinates, PostGIS geography, IANA timezone, precision/confidence, and validation state in one event-owned `event_locations` row separate from public DTOs. Mapbox Geocoding v6 is the Preview/Production provider behind `LocationProvider`; automated tests use deterministic Bakersfield fixtures.

The server validates the IANA zone and converts local start/end values into unambiguous UTC instants. Nonexistent and ambiguous daylight-saving local times are rejected. Saved schedule and location zones must match.

Public projections enforce one of three modes:

- `EXACT_ADDRESS`: exact address fields are projected.
- `APPROXIMATE_LOCATION`: only city, region, country, and a broad label are projected; exact coordinates/address never reach the browser.
- `HIDDEN_UNTIL_START`: city/region are projected until authoritative server time reaches the UTC start instant, then exact fields may be projected.

## Consequences

Owner editor DTOs may contain exact private fields. Dashboard lists, ordinary audit metadata, approximate/hidden public DTOs, and logs do not. Mapbox does not select application state or expose SDK types outside infrastructure. Live Mapbox checks are Preview-only and require `MAPBOX_RESOURCE_ENV=preview`.
