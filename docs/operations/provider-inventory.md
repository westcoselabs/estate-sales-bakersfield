# Active Provider Inventory

This inventory describes current runtime behavior and the approved hosted
topology.

| Capability           | Local                                          | Test                                     | Stable Production beta                            |
| -------------------- | ---------------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| PostgreSQL/PostGIS   | Development Neon                               | generated schema inside Development Neon | Production-scoped Neon                            |
| Authentication email | capture by default                             | capture                                  | Production-scoped Resend                          |
| Media                | non-Production adapter                         | deterministic `.tmp` store               | private Production Blob                           |
| Address selection    | Geoapify when configured                       | deterministic Bakersfield fixture        | server-mediated Geoapify autocomplete             |
| Controlled geocoding | authenticated admin only                       | deterministic fixture                    | server-only Geoapify forward geocoding            |
| Browser maps         | MapLibre GL JS                                 | MapLibre with inline source-free style   | MapLibre GL JS                                    |
| Map style/tiles      | OpenFreeMap or configured non-Production style | no provider request                      | OpenFreeMap Liberty                               |
| Rate limits/jobs     | Development PostgreSQL                         | scoped Development-schema PostgreSQL     | Production PostgreSQL and authenticated runner    |
| Payment              | deterministic fixture                          | deterministic fixture                    | existing Stripe test/sandbox Checkout and webhook |

`APP_ENV=preview` compatibility remains in source. No Vercel Preview or
Preview-specific provider inventory is approved.

## Location boundaries

- `GEOAPIFY_API_KEY` is private, server-only, and never enters browser output.
- `NEXT_PUBLIC_MAP_STYLE_URL` is public and defaults to
  `https://tiles.openfreemap.org/styles/liberty`.
- Organizer browsers call the application autocomplete endpoint, not Geoapify.
- Forward geocoding is not public and is not used for ordinary selected
  suggestions or Explore rendering.
- Confirmed structured addresses and coordinates are stored permanently in
  Production Neon/PostGIS with provider attribution.
- Approximate and pre-release hidden markers use an application-owned public
  zone, not transformed private coordinates.

Mapbox and Google Maps are superseded, not active targets. Historical Mapbox rows
remain readable with truthful `LEGACY_PROVIDER` provenance. Historical ADRs
and reports remain preserved.

## Explicit non-providers

Stripe Connect, another queue, local PostgreSQL, Docker, Upstash, card
collection, custom Elements, embedded Checkout, another payment processor,
Google Maps Platform, and a React map wrapper are not part of the active
provider inventory.
