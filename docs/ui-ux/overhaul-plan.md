# Active UI/UX Overhaul Plan

**Status:** Active

**Updated:** 2026-07-24

This plan is the current implementation roadmap for the noindex Vercel
Production beta. Historical acceptance reports, frozen roadmaps, ADR 008,
ADR 012, and the Google handoff remain preserved records; they are not active
provider gates.

## Authority

When sources disagree, use:

1. current application code and database migrations;
2. [ADR 013](../adr/013-maplibre-openfreemap-geoapify-location.md);
3. the [active location/Explore handoff](./location-explore-handoff.md);
4. root `DESIGN.md`;
5. current operations runbooks.

## Product posture

- One Bakersfield directory for estate sales and yard sales.
- One organizer builder, revision approval, payment, and publication flow.
- One shared public search with list and map views.
- One stable Vercel Production beta, kept noindex.
- Local work proceeds on `main`; no Preview deployment or Preview resources.
- Public launch, live Stripe, indexing, and unrelated features are separate
  future decisions.

## Visual system

Keep the approved warm editorial marketplace:

- forest primary actions and estate markers;
- gold yard-sale markers and restrained highlights;
- parchment/surface neutrals;
- serif display headings with clear sans-serif controls;
- modest radius, border, and shadow hierarchy;
- purposeful motion with complete reduced-motion behavior;
- comfortable desktop density and safe-area-aware mobile controls.

Reuse the shared tokens, primitives, cards, shells, icons, focus treatment,
loading/error patterns, and the approved mockups in `docs/mock-ups/`.

## Completed foundation

- public marketplace home and category hubs;
- normalized shared public search;
- organizer dashboard and five-step builder;
- private media processing;
- revision-bound approval and Stripe-hosted beta Checkout;
- immutable publication snapshots and privacy-aware listing projections;
- responsive public and authenticated shells;
- site-wide beta noindex posture.

## Active location architecture

| Concern                     | Decision                                               |
| --------------------------- | ------------------------------------------------------ |
| Browser renderer            | MapLibre GL JS                                         |
| Launch map style/tiles      | OpenFreeMap Liberty                                    |
| Organizer address selection | server-mediated Geoapify autocomplete                  |
| Controlled resolution       | authenticated administrator Geoapify forward geocoding |
| Confirmed authority         | Neon/PostGIS                                           |
| Approximate public geometry | application-owned Bakersfield zone centroid            |

Google Maps is no longer an implementation target. Mapbox is a superseded
provider retained only long enough to prove migration and legacy-row
compatibility, then removed in a dedicated cleanup.

## Organizer Address and Privacy step

Required flow:

1. Organizer enters at least four useful address characters.
2. Accessible combobox debounces, cancels stale work, and exposes loading,
   empty, unavailable, rate-limit, and retry states.
3. Organizer chooses a normalized structured suggestion.
4. Selected address is shown for review.
5. MapLibre loads only after selection and shows a non-draggable pin.
6. Organizer confirms the pin.
7. Server verifies the signed selection and persists structured address,
   coordinates, geography, provider provenance, actor, and time.
8. Any address/unit change clears confirmation and requires a new selection.

When the provider is unavailable, free-form text saves as an unconfirmed draft.
The organizer may continue with photos and review. Approval, payment, and
publication remain blocked.

The browser must never receive `GEOAPIFY_API_KEY`, raw provider responses, or a
public geocoding fallback.

## Public location privacy

Support exactly:

- `EXACT_ADDRESS`: exact marker only while publication rules authorize it;
- `APPROXIMATE_LOCATION`: stable application-owned public-zone centroid;
- `HIDDEN_UNTIL_START`: public-zone centroid before authoritative release,
  confirmed exact marker afterward.

Never create approximate geometry by rounding, truncating, jittering, or
offsetting a private point. Protected bounds filtering, pagination, and
clusters depend only on public-zone geometry.

For protected modes, readiness rejects a normalized house-number and matching
street in title or description. Normalize case, punctuation, whitespace,
suffixes, and unit formatting. Do not rewrite content, echo the address in an
error, or log it.

## Shared list and map projection

`projection=list` returns cards without geometry.

`projection=map` returns the identical loaded listing IDs plus a narrow marker
projection containing only:

- public ID and route;
- sale type and public title;
- public schedule;
- privacy-safe label;
- authorized cover image;
- approved point;
- marker kind.

No private address, postal code, private point, provider identifier, provider
payload, publication snapshot, organizer private data, or
account/payment/approval state may cross this boundary.

## Explore interaction

Desktop:

- split synchronized list and map;
- forest/gold estate/yard markers;
- selected card/marker state;
- loaded-page clusters;
- listing preview;
- explicit **Search this area**.

Mobile:

- list remains default;
- sticky List/Map toggle;
- full-height safe-area map;
- filter dialog presented as a bottom sheet;
- selected-listing preview sheet;
- accessible controls and no horizontal overflow.

MapLibre is dynamically imported only when map results render. List view
receives no marker geometry and makes no map-style request. A map failure never
removes the server-rendered results.

## Search policy

SSR and API use one normalizer:

- allow only `sale`, `date`, `from`, `to`, `view`, `cursor`, and `bounds`;
- reject repeated/unsupported parameters before database work;
- bound page size, cursor length, and date intervals;
- allow bounds only inside the Bakersfield rectangle with useful spans;
- expose no radius or distance sort;
- maintain separate durable list and map rate limits;
- return `429` and `Retry-After`;
- fail closed if durable limiting is unavailable;
- never log addresses or coordinates.

Panning does not query. **Search this area** submits bounds and resets the
cursor.

## Accessibility and responsive acceptance

- Keyboard-operable autocomplete and map-adjacent controls.
- Correct combobox/listbox state and live announcements.
- Visible focus and returned focus for dialogs.
- One H1, unique titles, canonical URLs, and noindex metadata.
- Reduced motion respected.
- Provider/map failure leaves usable controls and content.
- No horizontal overflow at 360, 390, 430, 768, 1280, and 1440 px.

## Environment and provider safety

Production requires:

```text
GEOAPIFY_API_KEY=<private server-only value>
NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
```

Normal automated tests use deterministic location and inline map fixtures and
make no provider calls. CSP permits only the required OpenFreeMap host and
MapLibre blob workers. Terms and Privacy disclose MapLibre, OpenFreeMap,
OpenStreetMap-derived data, Geoapify, and permanent confirmed-location storage.

## Verification and release

Before push:

1. ESLint.
2. Dependency architecture.
3. TypeScript.
4. Prisma validation and migration status.
5. Production-equivalent build.
6. Complete unit, integration, contract, and Playwright suites.
7. Changed-file formatting and `git diff --check`.
8. Legacy Mapbox row-read compatibility and forward migration proof.

Commit boundaries:

1. provider/domain migration;
2. organizer address workflow;
3. public MapLibre Explore map;
4. old-provider cleanup and operational documentation.

Then push `main`, deploy the existing Production beta, run bounded hosted
address-selection, pin-confirmation, privacy, list, map, provider-failure,
attribution, noindex, and responsive smoke tests, and stop with a release
report. Do not enable indexing or begin public launch work.
