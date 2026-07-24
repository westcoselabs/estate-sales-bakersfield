# Active Provider Inventory

This inventory describes current runtime behavior and the approved operating
topology. It does not treat a future Google Maps design as deployed.

| Capability           | Local                                | Test                                 | Stable Production beta                                            |
| -------------------- | ------------------------------------ | ------------------------------------ | ----------------------------------------------------------------- |
| PostgreSQL/PostGIS   | non-Production database when needed  | isolated Test Neon                   | Production-scoped Neon                                            |
| Authentication email | capture provider by default          | capture provider                     | current Production-scoped Resend                                  |
| Media                | non-Production adapter/resource      | deterministic `.tmp` store           | current private Production Blob                                   |
| Location             | fixture or non-Production provider   | deterministic Bakersfield fixture    | current server-side Mapbox forward geocoder                       |
| Rate limits/jobs     | PostgreSQL                           | scoped Test PostgreSQL               | Production PostgreSQL and authenticated runner                    |
| Payment              | deterministic fake and fixture price | deterministic fake and fixture price | existing Stripe test/sandbox Checkout and stable endpoint webhook |

The source still contains `APP_ENV=preview` compatibility and Preview marker
validation. No Vercel Preview deployment or Preview-specific provider
inventory is approved for the active workflow.

## Current location provider

Mapbox remains current runtime and keeps a matching
`MAPBOX_RESOURCE_ENV=production` marker in the stable beta. The integration
performs server-side forward geocoding; it is not an interactive browser map.
Removing Mapbox before an approved migration would break location validation.

## Conditional Google Maps provider

Google Maps Platform is a proposed replacement, not an active provider. The
target is limited to:

- Maps JavaScript API for organizer pin confirmation and `/search` map view
- Places API (New) for organizer address selection
- Maps JavaScript Geocoding Service for an authenticated, administrator-only
  fallback, with the browser key restricted in Google Cloud to the required
  `Geocoding API`

Address Validation, Roads, Places UI Kit, Routes, Directions API, Distance
Matrix, Map Tiles, Street View, and Aerial View remain deferred.

The asserted `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and
`NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` are not recognized by checked-in environment
validation. Their external presence does not make Google live. Do not print
values, create a second credential, enable other APIs, or use the browser key
for server REST calls.

Implementation remains blocked until written provider or qualified legal
confirmation, approved storage and privacy designs, restricted origin/API
configuration, a valid Map ID, CSP, redaction, quotas, billing alerts, and an
approved migration/removal sequence are all in place.

## Explicit non-providers

Stripe Connect, another queue, local PostgreSQL, Docker, Upstash, card
collection, custom Elements, embedded Checkout, another payment processor, and
any deferred Google API are not part of the current provider inventory.
