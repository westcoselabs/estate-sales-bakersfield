# Estate Sales Bakersfield UI/UX Overhaul Implementation Plan

**Status:** Planning only; no implementation is authorized by this document

**Branch:** `feature/ui-ux-overhaul`

**Normative design source:** root `DESIGN.md`

**Primary viewport:** 360-430px, progressively enhanced for tablet and desktop

**Production posture:** This document does not authorize a Production change.
The approved hosted review path is the existing, stable Production beta only,
and it remains `noindex` until the public-launch gate is approved.

## Plan contract

This document converts the approved design system into an implementation plan.
It does not authorize application code, dependency, schema, provider,
environment, infrastructure, merge, deployment, or indexing changes.

When sources disagree, implementation must follow this order:

1. Existing backend, security, privacy, payment, and publication rules.
2. Root `DESIGN.md`.
3. This implementation plan.
4. The three files in `docs/mock-ups/` as conceptual references only.

The `/ui-ux-pro-max` design-system workflow was run with a query centered on a
mobile-first, local, trustworthy, photo-forward estate-sale marketplace. Its
useful recommendations--mobile-first composition, 48px targets, explicit
labels, visible focus, responsive density, bottom sheets, loading feedback, and
reduced-motion support--are incorporated here. Its community/forum pattern,
social metrics, decorative typography, blue/teal SaaS palette, orange primary,
and indigo gradients are rejected in favor of the approved product direction.

The Graphify report was useful for module orientation but reflects mostly the
earlier foundation phase. Current source, tests, migrations, and architecture
documents are authoritative for the Phase 3 and Phase 4 workflows.

### Fixed architecture decisions

- `/search` is the only public results and interactive-map system.
- Explore opens `/search`; list is the default view.
- Map opens `/search?view=map`.
- `/estate-sales` and `/yard-sales` are indexable editorial category landing
  pages after public-launch approval. They are not separate results systems.
- Category and marketing pages may show selected upcoming listings, but they
  must use the shared public-listing query and shared listing cards.
- Only immutable, paid `EventPublication` records that pass current
  cancellation, removal, schedule, and privacy rules may appear publicly.
- List and map use one normalized filter, sort, cursor, listing, and marker
  contract.
- The initial list response is server rendered where practical. The conditional
  Google Maps browser runtime and other heavy client code are loaded only when
  needed.
- Existing authentication, organizer, event, photo, approval, payment,
  privacy, and publication rules remain authoritative.
- Production beta stays `noindex` until the SEO, content, inventory, privacy,
  and launch gate is explicitly approved.
- Google Maps Platform is the intended Mapbox replacement, but implementation
  is blocked until written Google Maps Platform or qualified legal
  confirmation covers this estate-sale directory use case, the intended
  provider-data lifecycle, and public display.
- The conditionally approved launch APIs are Maps JavaScript API, Places API
  (New), and the Maps JavaScript Geocoding Service for controlled
  administrator fallback. Address Validation and all other Google Maps
  Platform APIs remain deferred.
- Mapbox remains the current server-side location provider until the legal,
  storage, credential, privacy, and migration gates in Section 23 are
  satisfied.

### Non-goals

The overhaul must not present these as current capabilities: favorites, saved
searches, alerts, recommendations, recently viewed history, analytics,
listing/profile views, reviews, messages, item categories, item prices, price
filters, neighborhoods, featured placement, auctions, flea markets, a separate
garage-sale type, or organizer upgrades.

## 1. Current UI and UX audit

### Product and architecture strengths

- The repository is a modular monolith with explicit application-owned ports,
  server-only provider adapters, typed validation, and strong ownership
  boundaries.
- Authentication supports registration, scanner-safe email verification,
  login, password recovery, session listing/revocation, restricted accounts,
  and disabled accounts.
- Organizer onboarding supports partial saves. Completion requires display
  name, contact name, and contact email; phone and website are optional.
- The event workflow already enforces five business stages, optimistic
  concurrency, readiness, approval invalidation, and published-listing edit
  locks.
- Photo handling already provides private reservation, upload, server
  processing, READY confirmation, cover selection, ordering, retry, deletion,
  and purpose-sized WebP variants.
- Stripe Checkout return pages are non-authoritative. Signed webhook or
  protected reconciliation is the only publication authority.
- Public detail pages use immutable publication snapshots, stable canonical
  paths, privacy projection, authorized media, Open Graph metadata, and Event
  structured data.
- Existing forms generally use real labels, fieldsets, disabled/busy states,
  focus outlines, and status/live-region semantics.

### Surface audit

| Surface                           | Current state                                                                       | Primary UX issue                                                                                    | Overhaul response                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `/`                               | In-progress marketplace homepage exists in the preserved working tree               | Requires content, shared-search, mobile, accessibility, and acceptance review before promotion      | Finish one mobile-first discovery homepage without introducing a second search system |
| `/estate-sales` and `/yard-sales` | In-progress editorial category pages link to the shared filtered search             | Require inventory/content, canonical, internal-link, and no-thin-page acceptance                    | Keep them as content landings; filters/results remain owned by `/search`              |
| Public detail                     | Functional snapshot-based page in the shared public shell                           | Still needs photo hierarchy, authored-alt prerequisite, and an approved expired projection          | Redesign presentation without changing snapshot authority                             |
| Authentication                    | Branded responsive auth shell preserves the complete workflows                      | The shared client form remains large and needs continued state-regression discipline                | Preserve backend behavior; extract presentation only when a focused change needs it   |
| `/dashboard`                      | Workflow-led overview plus listings, profile, and settings routes are implemented   | Summary-query efficiency and all real recovery states still need phase acceptance                   | Preserve the shared dashboard system; add no invented analytics                       |
| Event builder                     | Premium five-step UI exists in one large client component                           | Presentation and domain orchestration remain tightly coupled; Google location is not implemented    | Extract incrementally and gate all location-contract changes                          |
| Payment                           | Correct authority/polling with branded workflow states                              | Must retain every delayed, failed, stale-revision, and webhook-authority recovery path              | Reuse real statuses and keep server/webhook authority                                 |
| Navigation                        | Public, auth, dashboard, and focused-builder shells are implemented                 | In-progress public marketing changes still require responsive and semantic regression review        | Preserve the shared shells and extend them without parallel navigation systems        |
| CSS                               | Global, foundation, and in-progress marketplace layers use approved semantic tokens | The large style layers require ownership discipline, bundle review, and incremental consolidation   | Keep tokenized layers; avoid route-specific duplication and a broad rewrite           |
| Testing                           | Strong unit/integration/provider contracts plus responsive E2E assertions           | No complete visual baseline matrix, automated accessibility suite, SEO crawl, or performance budget | Add deterministic visual, semantic, SEO, privacy, and performance evidence            |

### Current workflow truths to preserve

- Signup uses a 2-100 character display name, normalized valid email, and
  matching 12-128 character passwords.
- Verification links are scanner-safe: GET renders confirmation and only an
  explicit POST consumes the token.
- Verification tokens expire after 24 hours; reset tokens expire after one
  hour.
- Password reset revokes existing sessions.
- Unverified users may save organizer information and draft text, schedule, and
  location. They may not upload photos, preview, approve, pay, or publish.
- Complete organizer status is required before event creation/management.
- Event ownership is derived from the session and repeated at the repository
  boundary.
- Details require title and description; schedule uses local values plus an
  IANA timezone; location is server validated; schedule and location timezones
  must agree.
- Privacy modes are `EXACT_ADDRESS`, `APPROXIMATE_LOCATION`, and
  `HIDDEN_UNTIL_START`.
- Supported uploads are JPEG, PNG, WebP, HEIC, and HEIF up to 15MB each.
- Photos are complete only after the server returns `READY`; a cover must be a
  READY photo.
- Approval binds an exact revision/digest and versioned terms. Material changes
  invalidate approval.
- A future start, verified location, complete organizer, ready cover, current
  approval, and configured payment are required for Checkout.
- A paid attempt without an immutable publication is not a public listing.

### Code and performance observations

- `src/app/_components/auth-forms.tsx` and
  `src/app/_components/event-builder.tsx` contain too many independent UI
  responsibilities. Refactor them incrementally; do not rewrite domain logic.
- Dashboard payment status is currently loaded once per event. The dashboard
  phase should define one application-owned summary query to avoid an N+1
  pattern, without changing persistence unless query-plan evidence requires it.
- Public detail and preview use raw `<img>` elements, and publication snapshots
  do not contain dimensions. Reserve aspect ratios immediately; any snapshot or
  schema expansion for intrinsic dimensions or authored alt text is a separate
  approval.
- The current working implementation has a server-rendered `/search` list,
  shared `public-search-v1` list contract, and an API that deliberately returns
  `503 MAP_PROJECTION_UNAVAILABLE` for map projection. It has no browser map
  SDK, public marker DTO, coordinate-expiry model, or public-search rate
  limiter.
- Current location resolution is server-only Mapbox forward geocoding.
  `EventLocation` stores provider address fields and exact coordinates in
  scalar and PostGIS forms without a provider-data expiry lifecycle.
- Checked-in environment validation recognizes the existing Mapbox server
  variables but not `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` or
  `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. The asserted hosted Google configuration
  must be verified without printing values before implementation; this
  planning document does not add or change credentials.
- Root metadata already applies the fail-closed `prelaunchRobots` policy, and
  sensitive routes apply `noindex,nofollow`. Preserve that behavior throughout
  the overhaul; removing `noindex` remains a separate public-launch decision
  and must never be inferred from `PRODUCTION_BETA_MODE` or Stripe mode.

## 2. Mockup translation matrix

| Mockup idea                                         | Decision             | Translation                                                                                                           |
| --------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Warm neutral, forest, and gold identity             | Retain               | Use approved tokens from `DESIGN.md`; gold keeps dark text                                                            |
| Photo-forward homepage and cards                    | Retain               | Use real listing photography, reserved ratios, one prioritized LCP image, and quiet opaque copy surfaces              |
| Large desktop list/map composition                  | Adapt                | Use one-column list or full map at 360-430px; synchronized split is a desktop enhancement                             |
| Search and filter toolbar                           | Adapt                | Mobile uses concise controls and bottom sheets; desktop may expose an inline bar                                      |
| Glass panels                                        | Adapt                | Restrict to sticky navigation, map controls, and sheets; forms/cards stay opaque                                      |
| Listing card hierarchy                              | Retain               | Cover, type, title, date/time, privacy-safe city/region, then conditionally supported distance                        |
| Marker clusters and selected preview                | Retain conditionally | Implement only after the public marker/privacy contract is approved                                                   |
| Map/list toggle                                     | Retain               | Both are views inside `/search`, never separate result implementations                                                |
| Dashboard shell and workflow rows                   | Retain               | Replace mock metrics with real readiness, payment, publication, and next-action data                                  |
| Mobile bottom sheets                                | Retain               | Use for filters, custom dates, and map previews with keyboard/dialog semantics                                        |
| Status badges and progress                          | Retain               | Use only real workflow/photo/payment states                                                                           |
| Seller conversion card                              | Retain               | Link to self-service listing creation; state a numeric fee only through an approved public source                     |
| Professional service callout                        | Retain               | Secondary CTA to the Simply Decorated estate-sale-services page; clearly external and separate from platform checkout |
| Favorites/hearts                                    | Remove               | No data model or contract                                                                                             |
| Saved searches and alerts                           | Remove               | No data model or contract                                                                                             |
| Recently viewed and recommendations                 | Remove               | No data model or contract                                                                                             |
| Analytics and view counts                           | Remove               | No authoritative data                                                                                                 |
| Notifications and messages                          | Remove               | No current workflow                                                                                                   |
| Item tags and category filters                      | Remove               | No inventory/category schema                                                                                          |
| Item price filters or price-drop alerts             | Remove               | Publication fee is not public item-price data                                                                         |
| Neighborhood filters                                | Remove               | No normalized neighborhood field                                                                                      |
| Auctions, flea markets, thrift, or garage-sale type | Remove               | Current type is exactly estate sale or yard sale                                                                      |
| Featured/Pro treatment                              | Remove               | No featured state or upgrade contract                                                                                 |
| Generic location, distance, and keyword controls    | Gate                 | Show only after public query, privacy, and performance approval                                                       |

## 3. User types and primary journeys

### Nearby shopper

Goal: find a relevant upcoming sale quickly on a phone.

1. Land on `/`, `/estate-sales`, `/yard-sales`, or a listing detail from search.
2. Choose Explore, Map, a sale type, a date preset, or a selected listing.
3. Arrive at the single `/search` experience with shareable URL state.
4. Scan privacy-safe cards, switch list/map, adjust supported filters, and open
   a canonical detail page.
5. Understand date, time, sale type, organizer, and address availability
   without creating an account.

### Prospective self-service seller

Goal: understand the listing offer and begin safely.

1. Enter from the homepage, `/list-your-sale`, `/how-it-works`, category pages,
   or listing detail.
2. Understand the five-step workflow, fee timing (and a numeric fee only when
   an approved public source exists), privacy choices, photo expectations,
   approval, and payment authority.
3. Create an account, verify email, complete the organizer profile, and create
   a draft.
4. Return to the dashboard with the most important next action visible.

### Seller needing professional assistance

Goal: get hands-on help rather than use only self-service tools.

1. Encounter the secondary service CTA on `/list-your-sale`,
   `/how-it-works`, the estate-sales category page, FAQ, or relevant seller
   section.
2. See that organizing, pricing, staging, and promotion are an external
   professional service, not included in the platform listing fee.
3. Follow the external link to
   `https://decoratedbyriley.com/estate-sale-companies-bakersfield/`.

### Authenticated organizer

Goal: finish and publish a valid listing with minimal uncertainty.

1. Open the dashboard and see one server-derived priority action.
2. Resume a draft or create a listing.
3. Complete Details, Schedule, Address and privacy, Photos, then Review and
   publish.
4. Resolve validation, conflict, processing, approval, payment, and
   publication states without losing confirmed work.
5. Return later to view the published listing or recover an actionable state.

### Restricted/disabled account and operational admin

- A restricted user with a still-valid authenticated session retains the
  current dashboard notice and support guidance. Login remains generic for
  non-ACTIVE accounts, including restricted or disabled accounts.
- `/admin` remains an access-checked operational placeholder. This overhaul
  does not invent an admin product.

## 4. Full route and page matrix

### Public and marketing routes

| Route                             | Planned role                            | Rendering/data                                                                       | Indexing after public launch                         | Phase       |
| --------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- | ----------- |
| `/`                               | Local marketplace homepage              | Server-rendered marketing plus selected upcoming publications from shared query      | Index                                                | 3           |
| `/search`                         | Only list/map results experience        | Phase 3 default/sale list; Phase 4 filters, cursors, and lazy map                    | Always `noindex,follow`; exclude from sitemap        | 3-4         |
| `/search?view=map`                | Map view of the same results            | Same items, filters, markers, sort, and cursor contract                              | Same canonical/noindex policy as `/search`           | 4           |
| `/estate-sales`                   | Estate-sale category landing            | Editorial content plus selected shared listing cards; CTA to `/search?sale=estate`   | Index                                                | 3           |
| `/yard-sales`                     | Yard-sale category landing              | Editorial content plus selected shared listing cards; CTA to `/search?sale=yard`     | Index                                                | 3           |
| `/estate-sales/[slug]-[publicId]` | Canonical estate-sale detail            | Immutable publication snapshot plus runtime privacy projection                       | Index only while active/upcoming and launch-approved | 5           |
| `/yard-sales/[slug]-[publicId]`   | Canonical yard-sale detail              | Same detail implementation and projection                                            | Same                                                 | 5           |
| `/how-it-works`                   | Buyer and seller process                | Static/server-rendered factual content                                               | Index                                                | 3           |
| `/list-your-sale`                 | Self-service listing offer and workflow | Non-numeric fee timing and signup CTA; a numeric fee needs an approved public source | Index                                                | 3           |
| `/about`                          | Local purpose, trust, and boundaries    | Static/server-rendered                                                               | Index                                                | 3           |
| `/faq`                            | Real buyer/seller questions             | Static/server-rendered; FAQ structured data only when visible content qualifies      | Index                                                | 3           |
| `/contact`                        | Support and contact paths               | Approved static contact links; an onsite form needs a submission contract            | Index                                                | 3           |
| `/privacy`                        | Privacy policy                          | Approved legal content                                                               | Index                                                | 3           |
| `/terms`                          | Terms                                   | Approved legal content and current publishing-terms relationship                     | Index                                                | 3           |
| `/safety`                         | Optional trust/safety guidance          | Add shortly after launch only with substantive approved content                      | Index when substantive                               | Post-launch |
| Future city/location pages        | Local search landing pages              | Unique inventory and local content required                                          | Wait; never create thin doorway pages                | Future gate |

### Authentication and application routes

| Route                                         | Planned role                                            | Access and behavior                                           | Indexing           | Phase           |
| --------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- | ------------------ | --------------- |
| `/signup`                                     | Registration                                            | Preserve current API and validation                           | `noindex,nofollow` | 2               |
| `/login`                                      | Login and safe `next` redirect                          | Preserve generic errors and status handling                   | `noindex,nofollow` | 2               |
| `/verify-email`                               | Scanner-safe confirmation                               | GET never mutates; explicit POST verifies                     | `noindex,nofollow` | 2               |
| `/forgot-password`                            | Enumeration-resistant reset request                     | Preserve generic response                                     | `noindex,nofollow` | 2               |
| `/reset-password`                             | One-time reset completion                               | Preserve expiry, validation, and session revocation           | `noindex,nofollow` | 2               |
| `/dashboard`                                  | Organizer overview                                      | Authenticated; priority next action and recent real listings  | `noindex,nofollow` | 6               |
| `/dashboard/events`                           | All organizer listings                                  | Authenticated; shared status filters derived from real states | `noindex,nofollow` | 6               |
| `/dashboard/events/new`                       | Choose estate or yard sale and create draft             | Reuse current create command; no new business rule            | `noindex,nofollow` | 6               |
| `/dashboard/organizer`                        | Organizer public/profile data                           | Preserve partial save and completion rules                    | `noindex,nofollow` | 6               |
| `/dashboard/account`                          | Email status, sessions, password/security links, logout | Reuse existing auth/session contracts                         | `noindex,nofollow` | 6               |
| `/dashboard/events/[eventId]/edit`            | Five-step builder                                       | Preserve ownership, readiness, version, and edit lock         | `noindex,nofollow` | 7               |
| `/dashboard/events/[eventId]/preview`         | Exact future listing review                             | Preserve verified/readiness gates and referrer policy         | `noindex,nofollow` | 7               |
| `/dashboard/events/[eventId]/payment`         | Payment/publication status                              | Preserve exact-revision eligibility                           | `noindex,nofollow` | 7               |
| `/dashboard/events/[eventId]/payment/success` | Non-authoritative Checkout return                       | Poll/display internal publication state                       | `noindex,nofollow` | 7               |
| `/dashboard/events/[eventId]/payment/cancel`  | Cancel/recovery return                                  | Preserve internal cancellation and recovery                   | `noindex,nofollow` | 7               |
| `/admin`                                      | Existing role-gated placeholder                         | No new admin tools                                            | `noindex,nofollow` | Regression only |
| `/test-checkout/[sessionId]`                  | Local/test fake Checkout                                | Remains unavailable outside allowed environments              | `noindex,nofollow` | Regression only |

### Supporting server routes

- Existing auth, account, organizer, event, photo, approval, payment, webhook,
  job, health, and media routes retain their contracts.
- The current working Phase 3 implementation provides the first bounded list
  slice of one application-owned public-search contract and a functional
  default `/search` destination. Phase 4 extends that exact contract with
  dates, location, cursors, and markers.
- `GET /api/search` is the single read-only client transport for pagination and
  lazy map data. Server components call the same application service directly;
  the route handler is an adapter, never a second query path.
- `src/app/robots.ts` and `src/app/sitemap.ts` are planned in Phase 8, with an
  early fail-closed Production-beta noindex guard in Phase 1.
- No public API may return a raw publication snapshot or private event location.

## 5. Mobile and desktop navigation architecture

### Public mobile

- Use a compact sticky top bar with brand, current-page context, and an
  explicit menu.
- Primary destinations are Explore (`/search`), Map
  (`/search?view=map`), How it works, and List your sale.
- Login changes to Dashboard for authenticated users.
- On `/search`, a sticky action area provides List/Map and Filters. It is a
  contextual control, not a second global navigation system.
- Keep the final result/action clear of the sticky bar and mobile safe area.
- Do not add a global favorites destination.

### Public desktop

- Use one public header: Explore, Map, How it works, About, Log in/Dashboard,
  and List your sale.
- Active navigation uses `aria-current` and a shape/weight indicator, not color
  alone.
- Category pages are discoverable through content/internal links rather than
  creating a second top-level results taxonomy.

### Dashboard mobile

- Use five labeled destinations: Overview, Listings, Create, Profile, Account.
- Create is a prominent action to `/dashboard/events/new`; it is not a
  fabricated dashboard metric.
- Builder routes replace dashboard navigation with a focused workflow header,
  Back, compact progress, and sticky current-step actions.

### Dashboard desktop

- Use a labeled sidebar with the same destinations and order as mobile.
- Show account/verification status without duplicating the overview's priority
  action.
- Never show desktop sidebar and mobile bottom navigation simultaneously.

### Navigation-state rules

- Safe internal `next` redirects continue to return users to the intended
  authenticated route.
- Browser Back restores `/search` filters, view, cursor, and scroll where the
  platform permits.
- Route changes move focus to the page heading after navigation; dialogs and
  sheets return focus to their trigger.
- A skip link targets the main content on every shell.

## 6. Shared component inventory

The future file structure is a target, not authorization to create files now.
Use CSS Modules or another existing no-dependency scoping strategy beside
components; reserve `src/app/globals.css` for tokens, reset, base typography,
and shared utilities.

### Primitive layer: `src/components/ui/`

- `Button`, `IconButton`, `TextLink`, `ExternalLink`
- `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Field`,
  `FieldError`, `ErrorSummary`
- `Chip`, `FilterChip`, `StatusBadge`, `Progress`, `Spinner`, `Skeleton`
- `Alert`, `InlineNotice`, `ToastRegion`, `EmptyState`
- `Dialog`, `BottomSheet`, `Menu`, `Disclosure`
- `ResponsiveImage`, `AspectRatio`, `Divider`
- `Pagination` or `LoadMore` backed by the shared opaque cursor

No UI or icon package is assumed. Any dependency requires approval. Use one
approved vector icon family or local assets; do not mix emoji and icon styles.

### Shell layer: `src/components/shells/`

- `PublicShell`, `PublicHeader`, `PublicFooter`
- `MarketingShell`
- `AuthShell`
- `DashboardShell`, `DashboardNav`
- `BuilderShell`, `BuilderHeader`, `StickyActionBar`

### Listing and search layer: `src/features/search/`

- `SearchSummary`, `SearchViewToggle`, `SearchFilterButton`
- `FilterSheet`, `ActiveFilterChips`
- `DatePresetControl`, `CustomDateSheet`, `DateRangeCalendar`
- `ListingCard`, `ListingCardSkeleton`, `ListingGrid`, `ListingList`
- `SearchEmptyState`, `SearchErrorState`, `CursorControls`
- `MapLoader`, `SearchMap`, `MapControls`, `MapMarker`, `MapCluster`
- `MapListingPreview`, using the same card projection

### Marketing and public listing layer

- `HeroSearch`, `CategoryLinkCard`, `SelectedListings`
- `SellerCTA`, `ProfessionalServiceCTA`, `TrustContent`
- `ListingHeader`, `ScheduleSummary`, `PrivacyLocation`,
  `PublicListingGallery`, `OrganizerSummary`, `Breadcrumbs`, `ExpiredNotice`

### Organizer layer: `src/features/dashboard/`

- `PriorityActionPanel`, `AccountReadiness`
- `OrganizerListingCard`, `ListingStatusFilters`, `WorkflowChecklist`
- `PaymentPublicationStatus`, `DashboardEmptyState`
- `SessionList`, `OrganizerProfileForm`

### Builder layer: `src/features/event-builder/`

- `BuilderProgress`, `BuilderStepLayout`, `SaveState`
- `DetailsStep`, `ScheduleStep`, `LocationPrivacyStep`, `PhotosStep`,
  `ReviewPublishStep`
- `PhotoUploadQueue`, `PhotoItem`, `PhotoProcessingState`,
  `PhotoOrderControls`, `CoverSelector`
- `ApprovalInvalidationDialog`, `ConflictNotice`, `ReadinessChecklist`
- `PaymentPanel`

### Reuse and migration rules

- Move presentation incrementally out of current app-local components; keep
  application and domain calls at existing boundaries.
- One `ListingCard` and one public card projection serve homepage selections,
  category selections, search results, and map previews through variants.
- One status mapper owns human-readable payment/publication labels.
- One date normalizer owns URL parsing and all preset boundaries.
- One privacy projection owns public detail, cards, and markers.
- Avoid a "universal card" with dozens of booleans; use small documented
  variants with the same core data contract.

## 7. Authentication-screen plan

### Shared composition

- Use a calm, single-column `AuthShell` at 360-430px with brand, one H1,
  concise context, persistent field labels, primary action, and one secondary
  path.
- At tablet/desktop, allow a restrained supporting image or trust panel, but
  keep the form measure near 28rem and never overlay critical copy on a busy
  image.
- Keep form text at 16px or larger, targets at 48px, and password-manager
  compatible names/autocomplete.

### Route behavior

| Route           | Planned screen states                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Signup          | Default, client-invalid, server-invalid, submitting, check-email success, rate-limited, unavailable                                         |
| Login           | Default, generic sign-in failure for invalid or non-ACTIVE accounts, submitting, safe return destination, registered/verified/reset success |
| Verify email    | Token-present confirmation, explicit Verify action, verifying, verified, expired/used/invalid, resend path                                  |
| Forgot password | Default, submitting, generic check-email success, rate-limited, unavailable                                                                 |
| Reset password  | Token-present form, invalid fields, submitting, completed, expired/used token, request-new-link                                             |

### Non-negotiable behavior

- Do not consume a verification token during GET or page prefetch.
- Preserve enumeration-resistant login/reset responses and current abuse
  controls.
- Do not disclose restricted or disabled account status during login. A
  restricted notice is shown only when a still-valid authenticated session
  reaches the dashboard under the existing behavior.
- Preserve safe internal redirect validation.
- Do not add social login, magic links, MFA, or new authentication providers.
- Use an error summary linked to fields and move focus to the first invalid
  field after submission.
- A future show/hide password control must have a text label and preserve the
  input value/focus.
- Move active-session management from the overloaded dashboard to
  `/dashboard/account` without changing session contracts.

## 8. Homepage and marketing-page plan

### Homepage information order

1. Shared public header.
2. Local H1 and concise value proposition.
3. Search entry with Explore and Map actions; no unsupported keyword or radius
   claim before those contracts exist.
4. Selected upcoming listings from the shared publication query.
5. Estate sales and yard sales category paths.
6. "How listing works" summary for sellers.
7. Map teaser that links to `/search?view=map`; do not load the full map on the
   homepage.
8. Trust/privacy explanation grounded in real verification, privacy, approval,
   and publication behavior.
9. Self-service seller CTA.
10. Secondary Simply Decorated professional-service CTA.
11. FAQ preview and shared footer.

If no upcoming inventory exists, replace selected listings with a truthful
empty state and paths to broader dates, listing creation, and category content.
Do not render fabricated example listings.

### Marketing pages

| Page              | Primary intent                        | Required content                                                                                      |
| ----------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/how-it-works`   | "How do I find or list a sale?"       | Buyer flow, seller five-step flow, verification, privacy, payment/publication authority               |
| `/list-your-sale` | "How can I advertise my sale?"        | Who self-service fits, required content/photos, privacy modes, non-numeric fee timing, account CTA    |
| `/about`          | "Can I trust this local marketplace?" | Bakersfield focus, platform role, organizer responsibility, privacy and moderation boundaries         |
| `/faq`            | Specific buyer/seller questions       | Dates, address release, listing types, photos, edits, payment timing, expired listings, support       |
| `/contact`        | "How do I get help?"                  | Owner-approved static email, phone, or external contact link; defer forms until a submission contract |
| `/privacy`        | Data/privacy expectations             | Approved legal copy including location and account data                                               |
| `/terms`          | Marketplace and publishing terms      | Approved legal copy aligned with versioned publishing terms                                           |

### Seller-assistance CTA

- Use the approved heading and copy from `DESIGN.md`.
- Link to the verified Simply Decorated estate-sale-services page.
- Add an external-link indicator and plain-language destination.
- Place it on `/list-your-sale`, `/how-it-works`, `/estate-sales`, FAQ seller
  content, and a restrained homepage seller section.
- Do not place it in Checkout or imply the service is included in platform
  payment.

## 9. SEO landing-page and content plan

### Audience and search intent

- Shoppers: upcoming estate sales, yard sales, dates, and local sale details in
  Bakersfield.
- Self-service organizers: list, advertise, or promote an estate/yard sale.
- Service-seeking sellers: professional help organizing, pricing, staging, and
  promoting an estate sale.
- Trust/support visitors: understand privacy, listing process, terms, and how
  to get help.

### Topic and metadata guidance

| Route             | Target topic                          | Title direction                                                            | Description direction                                                                    |
| ----------------- | ------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/`               | Estate and yard sales in Bakersfield  | "Estate Sales & Yard Sales in Bakersfield, CA" plus a concise brand suffix | Find upcoming local sales, browse the map, or list a sale                                |
| `/estate-sales`   | Upcoming Bakersfield estate sales     | "Upcoming Estate Sales in Bakersfield, CA"                                 | Explain the category, surface selected upcoming listings, and link to filtered search    |
| `/yard-sales`     | Upcoming Bakersfield yard sales       | "Upcoming Yard Sales in Bakersfield, CA"                                   | Explain the category, surface selected upcoming listings, and link to filtered search    |
| `/how-it-works`   | How to find or list a local sale      | "How Estate Sales Bakersfield Works"                                       | Summarize shopper discovery and the real five-step organizer flow                        |
| `/list-your-sale` | List/advertise an estate or yard sale | "List Your Estate or Yard Sale in Bakersfield"                             | State who self-service fits, the required preparation, and the next signup action        |
| `/about`          | Local marketplace trust               | "About Estate Sales Bakersfield"                                           | Explain the local focus, platform role, privacy, and boundaries                          |
| `/faq`            | Estate/yard sale questions            | "Estate Sales Bakersfield FAQ"                                             | Answer real buyer, seller, privacy, payment, and expired-listing questions               |
| Public detail     | The named upcoming sale               | Use the real title, sale type, and projected city/region                   | Use a bounded excerpt plus date and privacy-safe location; never include a hidden street |

Titles and descriptions must be generated from current public projections and
approved content, not from private event/location fields. Final lengths are
validated in rendered metadata rather than enforced through brittle character
counts.

### Launch tiers

**Required for first public launch**

- `/`, `/estate-sales`, `/yard-sales`
- `/how-it-works`, `/list-your-sale`, `/about`, `/faq`, `/contact`
- `/privacy`, `/terms`
- Eligible public listing details
- `/search` as a noindex utility

**Recommended shortly after launch**

- `/safety`, after substantive approved content exists
- Expanded FAQ sections based on real support questions
- Additional editorial guides only when they answer a distinct user need

**Wait for inventory and content**

- Bakersfield neighborhood pages
- Surrounding-city or ZIP landing pages
- Date/weekend archive pages
- Item/category pages
- Organizer profile pages

Do not create a location page merely because a route can be generated. Require
unique local copy, sustained search intent, enough current inventory, internal
links, and an owner-approved quality threshold. Avoid duplicate city/ZIP
variants and doorway pages.

### Category landing behavior

- `/estate-sales` targets estate-sale discovery and explains the category
  without pretending to be the result set.
- `/yard-sales` targets yard-sale discovery and explains the category.
- Each shows a bounded selection of upcoming, matching, paid publications
  through the shared query and shared card.
- Primary actions are `/search?sale=estate` and `/search?sale=yard`.
- No filters, map implementation, cursor contract, or sorting logic lives in
  either category page.

### Content quality

- Use one descriptive H1 and a logical H2/H3 hierarchy.
- Put the user's answer before promotional copy.
- Use Bakersfield and surrounding-area language naturally; do not stuff
  locations or repeat near-identical text.
- Claims about price, inventory, safety, attendance, or outcomes require a
  current authoritative source.
- Internally link category pages, selected listings, how-it-works, seller, FAQ,
  and contact content in context.

## 10. Shared `/search` list and map architecture

### Application-owned contract

Retain the existing `public-search` application boundary and
`public-search-v1` list slice. When the map gates pass, Phase 4 evolves the
transport once to `public-search-v2` while preserving the existing list fields
and semantics. It adds:

- `normalizeSearchQuery(raw, now, timezone)`
- `searchPublishedListings(criteria, now)`
- `PublicListingCardProjection`
- `PublicMapMarkerProjection`
- `PublicSearchPage` containing normalized criteria, list items, page
  information, and optional map-page data

The current API intentionally returns `503 MAP_PROJECTION_UNAVAILABLE` for a
map request. Preserve that fail-closed behavior until the marker contract,
public-zone source, provider-eligibility gate, and Google browser integration
are all approved and implemented.

The repository continues to select immutable, paid `EventPublication` rows,
joined only to authoritative event/location fields needed for structured
filters, cancellation/removal, schedule, and approved marker derivation. It
must never select draft/workflow/payment state as a substitute for
publication.

The card/detail source is the publication snapshot after runtime
`projectionAt(now)`. Raw snapshot JSON and private location records never enter
the public response.

`PublicListingCardProjection` is deliberately narrower than the public detail
projection. It may contain public ID/path, type, title, schedule/timezone,
city/region, location kind/approved public label, and authorized cover URL. It
never contains a street, postal code, exact coordinate, normalized address, or
raw organizer contact data, even when the detail projection is exact.

### Client transport and response version

- `GET /api/search` accepts the same normalized public URL parameters plus an
  internal `projection=list|map` selector.
- Until the map implementation is approved, the response remains
  `schema: "public-search-v1"`. The approved map release uses
  `schema: "public-search-v2"` with normalized criteria, at most 24 list items,
  opaque page information, and optional `mapPage`; it does not silently add
  geometry to v1.
- `projection=list` never returns marker geometry.
- After the map gate is cleared, `projection=map` returns the same current
  cursor page and ordered list item IDs plus a separate privacy-safe marker
  collection. A marker may exist only for an item on that page. It may be
  omitted when no authorized public geometry is available, including stale
  exact evidence without an approved public-zone fallback. The initial release
  caps the list at 24, clusters describe only markers on that loaded page, and
  `pageInfo.hasNext` communicates additional matching pages.
- `PublicMapMarkerProjection` contains only public listing ID, canonical route,
  sale type, title, schedule, privacy-safe public label, authorized cover URL,
  approved public geometry, and marker kind. It never contains private address
  fields, postal code, provider response objects, Place ID, raw publication
  snapshots, payment state, or account data.
- "Search this area" adds approved bounds, resets the cursor, and returns a new
  page with the same ordered list projection plus every marker that has
  authorized public geometry. A future all-viewport aggregation is a versioned
  contract extension, not a parallel implementation.
- The map island requests `projection=map` only after its lazy client code
  loads. Geometry is not embedded in list-only server HTML.
- Initial responses use `Cache-Control: no-store` so a cached payload cannot
  cross a hidden-address release boundary. Any shared caching requires a later
  time-bounded privacy/cache review.
- The handler enforces the same bounded page size, query schema, safe logging,
  and approved public-read abuse controls for every view.

### URL contract

| Parameter    | Initial values                                     | Default                  | Rule                                                          |
| ------------ | -------------------------------------------------- | ------------------------ | ------------------------------------------------------------- |
| `sale`       | `estate`, `yard`                                   | All supported sale types | Maps only to existing event types                             |
| `date`       | `today`, `weekend`, `next-7-days`, `custom`        | All upcoming             | `custom` requires valid `from` and `to`                       |
| `from`, `to` | `YYYY-MM-DD`                                       | Omitted                  | Used only for custom range                                    |
| `location`   | Approved locality slug, initially `bakersfield-ca` | Current marketplace area | Resolves to normalized city/region; no arbitrary neighborhood |
| `sort`       | `soonest`                                          | `soonest`                | Other sorts require data/privacy approval                     |
| `view`       | `list`, `map`                                      | `list`                   | Explore omits the default; Map uses `view=map`                |
| `cursor`     | Opaque server value                                | Omitted                  | Never parsed or constructed by the client                     |
| `bounds`     | Approved encoded bounds                            | Omitted                  | Must satisfy service-envelope and minimum-zone-size rules     |

Defaults are omitted from generated links. Applying filters or a view change
pushes meaningful history. Opening/closing a sheet does not. Map panning is
ephemeral until the user selects "Search this area"; only that action may update
approved bounds state.

Reject duplicate, unknown, malformed, and over-length public parameters before
database work. Normalize only unambiguous omissions to documented defaults.
Invalid custom dates produce an accessible inline error and do not issue a
misleading query. Opaque cursors are bound to normalized criteria and capped
at 500 characters. Public radius and distance filters are not part of the
launch contract.

### Rendering and client boundaries

- `/search` is a server component that parses URL state and renders the initial
  list, summary, active filters, and empty/error state as HTML.
- Search controls use small client islands for sheets, date selection, URL
  updates, and focus management.
- `SearchMap` is dynamically imported only when map view is requested or a
  desktop split view explicitly needs it.
- List view must not download Google Maps JavaScript, request Google tiles, or
  serialize marker geometry.
- The map island loads Maps JavaScript API and `AdvancedMarkerElement` only
  after the legal/provider and configuration gates are cleared. Google SDK
  types stay inside browser adapters and never become public application
  contracts.
- A map refresh and cursor request use the same normalization and service as
  the initial server render.
- Use an opaque deterministic cursor ordered by `(startsAt, publicId)` for
  `soonest`; do not expose offset assumptions.
- Do not promise an exact total count. Show it only if the approved query can
  provide it without a material performance cost.

### Mobile interaction

- List and map are mutually focused views at 360-430px.
- The view toggle, filter action, and active-filter summary remain reachable
  with one thumb.
- Filters and custom dates open accessible bottom sheets.
- Selecting a marker opens one compact listing-preview sheet.
- Closing the preview returns focus to the selected marker.
- List selection and marker selection share the same public ID; no duplicate
  listing model is allowed.
- A card without authorized marker geometry remains a usable listing result. It
  does not pan the map and exposes a concise accessible "Map location
  unavailable" status rather than fabricating a point.

### Desktop interaction

- At 1024px and above, `view=map` may use a synchronized list/map split.
- `view=list` remains a list/grid experience without paying the map cost.
- Hover may highlight the related marker/card, but keyboard focus and click
  provide the same behavior.
- "Search this area" is explicit; continuous query-on-pan is off by default.

### Empty, loading, and failure behavior

- No results preserve and summarize the active criteria and offer Clear
  filters or a broader approved location/date.
- Loading over 300ms uses geometry-matched card or map skeletons.
- Missing/invalid key, unauthorized referrer, invalid Map ID, quota, billing,
  Content Security Policy, script, or provider failure leaves the
  server-rendered list usable and offers a direct switch back to list view.
- Failed pagination leaves existing results in place and provides Retry.
- Do not replace a public error with fabricated inventory.

### Public-search abuse controls

- Apply one normalized validation and abuse policy to server-rendered and API
  requests.
- Keep the maximum page size at 24 and custom date ranges at no more than 31
  local calendar days.
- Accept only approved sale type, date, locality, sort, view, cursor, and
  bounds keys. Do not accept radius, distance, arbitrary neighborhood, or
  free-text location at launch.
- Bounds must remain inside the approved Bakersfield service envelope and may
  not be narrower than the smallest approved public zone.
- Start with 60 list requests and 20 map requests per hashed client per 60
  seconds. Return `429` with `Retry-After`; fail closed with `503` if the
  durable limiter is unavailable.
- Extract the existing HMAC client-fingerprint and rate-limit infrastructure
  into a provider-neutral platform boundary rather than importing
  authentication internals into public search.
- Record request category and outcome only. Never log addresses, postal codes,
  Place IDs, coordinates, bounds precise enough to reveal a residence, or API
  keys.

## 11. Supported filters and date behavior

### Capability matrix

| Capability                 | Data exists                       | Public contract exists now | Phase 4 disposition                                        |
| -------------------------- | --------------------------------- | -------------------------- | ---------------------------------------------------------- |
| Estate/yard sale type      | Yes                               | Yes, `public-search-v1`    | Preserve and harden through the shared v2 transport        |
| Today/custom date overlap  | Yes                               | Yes, `public-search-v1`    | Preserve; enforce the approved 31-day custom cap           |
| Weekend/next-seven presets | Derivable                         | Yes, `public-search-v1`    | Preserve the Los Angeles-time normalizer and DST tests     |
| Soonest sort               | Yes                               | Yes, `public-search-v1`    | Preserve deterministic criteria-bound cursor order         |
| City/region                | Yes                               | Yes, one approved locality | Preserve the bounded Bakersfield locality contract         |
| Postal code                | Stored privately                  | No                         | Defer; never expose it as a public filter                  |
| Approved map bounds        | Future public-zone geometry       | No                         | Gate on privacy, abuse, zone, query-plan, and map approval |
| Radius/distance            | Exact coordinates exist privately | No                         | Defer; excluded from the launch contract                   |
| Distance sort/display      | Derivable from private data       | No                         | Defer; do not expose                                       |
| Title/description keyword  | Text exists                       | No FTS contract/index      | Future prerequisite; do not ship a misleading input        |
| Neighborhood               | No normalized field               | No                         | Unsupported                                                |
| Item categories/tags       | No                                | No                         | Unsupported                                                |
| Item price                 | No                                | No                         | Unsupported                                                |
| Featured                   | No                                | No                         | Unsupported                                                |

### Date semantics

All presets use `America/Los_Angeles`, authoritative server time, and local
calendar boundaries converted safely to instants. User-selected calendar dates
are inclusive, but the query interval is half-open: from the selected start
date's local midnight through the local midnight after the selected end date.
A listing matches when the two half-open intervals overlap:

`startsAt < rangeEndExclusive AND endsAt > rangeStart`

- **Today:** the current Bakersfield calendar day.
- **This Weekend:**
  - Monday-Thursday: upcoming Friday through Sunday.
  - Friday: Friday through Sunday.
  - Saturday: Saturday through Sunday.
  - Sunday: Sunday only.
- **Next 7 Days:** today and the following six calendar days.
- **Custom:** inclusive local start/end dates; same-day is valid; end may not
  precede start.

Unit tests must cover every weekday, month/year rollover, spring-forward,
fall-back, same-day custom selection, invalid range, and listings spanning a
boundary. Include listings that start or end exactly at either boundary so
touching-but-not-overlapping intervals are excluded.

### Filter interaction

- Mobile shows 48px preset chips and a "Choose dates" action.
- The compact calendar sheet has weekday headers, previous/next month,
  selected-range text, Cancel, and Apply.
- Filter changes inside a sheet are staged until Apply; Cancel preserves the
  current URL/results.
- Active non-default filters appear as removable text chips.
- "Clear all" appears when more than one non-default filter is active.
- List and map update from the same normalized criteria.

## 12. Privacy-safe map marker and listing projection requirements

### Public projection boundary

Every public card, marker, map preview, detail, metadata object, and structured
data block must use an application-owned public DTO after runtime privacy
projection. Never serialize:

- Raw publication snapshot JSON.
- Private latitude/longitude or PostGIS geography unless the approved current
  projection explicitly permits an exact marker.
- Normalized address, provider place ID/name, precision, confidence, private
  postal code, contact email/phone, payment data, or approval digest.

### Conditional Google Places and pin-confirmation workflow

After the provider gates are cleared, the Address and Privacy builder step
uses this exact sequence:

1. Load the Maps JavaScript Places library only on that step.
2. Use `PlaceAutocompleteElement` with United States restriction and an
   approved Bakersfield-area bias.
3. Fetch only `id`, `formattedAddress`, `addressComponents`, and `location`.
4. Display provider content transiently with required Google attribution.
5. Show the selected point on a Google map with a non-draggable pin.
6. Require the organizer to confirm the pin or return to address search.
7. Save through a server-authorized application transition; never describe
   browser input as "Google verified."
8. Require a new selection and confirmation after any address change.

The organizer enters or edits the durable structured address in
application-owned fields before selection. Persist only those submitted values,
using application-defined syntactic normalization such as trimming and
country/region casing. Google `formattedAddress` and `addressComponents` may be
shown transiently for comparison but must not silently populate or overwrite
durable address fields. If the two representations do not describe the same
location to the organizer, return to the application-owned fields and require a
new selection. Organizer confirmation does not change the licensing status of
Google content.

The widget-managed autocomplete session lifecycle is preferred. A custom
data-API dropdown is allowed only if it preserves a unique session token,
keyboard accessibility, attribution, stale-request cancellation, and the same
narrow field mask.

If Google is unavailable, save organizer-entered address data only as an
unconfirmed draft, allow unrelated editing, and block approval, payment, and
publication. Never fabricate a Place ID, coordinate, or confirmation. Preserve
an existing confirmed location during a temporary failure only until its
permitted coordinate cache expires.

### Controlled Geocoding fallback

- Geocoding is only for authenticated administrators resolving imported,
  legacy, or otherwise unresolved records. It is not an organizer or public
  Explore fallback.
- With the approved single browser key, call the Maps JavaScript Geocoding
  Service interactively. Do not send the public browser key to a server REST
  endpoint.
- Record the resolution source, administrator, application confirmation time,
  provider retrieval time, and expiry.
- Do not support unattended batch geocoding or server refresh without a
  separately approved secure server identity.
- Arbitrary typed organizer input can never transition directly to
  publication-ready.

### Application-owned location state

Separate durable first-party state from expiring provider evidence:

- `EventLocation` retains only the organizer-entered application fields,
  timezone, privacy choice, public zone, and application confirmation. Existing
  Mapbox-normalized rows are legacy provider-derived data, not presumed
  first-party input; require re-entry and confirmation before a future
  publication-ready transition.
- Confirmation states are `UNCONFIRMED`, `CONFIRMED`, and `STALE`.
- Provider-evidence resolution sources are `ORGANIZER_PLACE_SELECTION`,
  `ADMIN_GEOCODING`, and `LEGACY_PROVIDER`.
- Confirmation actor/time and `publicZoneId` are application-owned.
- A one-to-one provider-evidence record contains provider/version, Place ID,
  resolution source, exact coordinate/PostGIS cache, retrieval time, expiry,
  Place-ID refresh time, and resolving administrator where applicable.
- Provider evidence and exact coordinates are nullable so a provider outage
  can still produce a valid unconfirmed draft.
- `PublicLocationZone` is application-owned data with stable slug, public
  label, licensed source/version, and coarse centroid geometry.
- Organizers using approximate or hidden privacy choose an approved public
  zone. Never derive it by rounding, jittering, offsetting, or spatially
  analyzing a Google coordinate.

Unless written provider/legal approval grants broader rights:

- Place IDs may be stored and IDs older than 12 months must be refreshed.
- Places-derived coordinates and their PostGIS point expire and are deleted no
  later than 30 days after retrieval.
- Google formatted addresses and address components are transient provider
  content, not durable application data.
- Pin confirmation does not convert Google content into unrestricted
  application-owned data.
- Stale coordinate geometry is removed from spatial queries.
- Existing Mapbox evidence is marked legacy/stale during a future migration;
  migration never invents a Google Place ID.
- Address, Place ID, privacy mode, or public-zone changes are material and
  invalidate approval.
- Refreshing evidence for the same Place ID is non-material; retrieval
  timestamps and expiring coordinates do not enter the approval digest.

The final schema and migration remain blocked until written clearance defines
which selected Place fields may be retained and reused publicly.

### Marker rules

| Runtime location state | Public text                                         | Marker behavior                                                                            |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Exact                  | Current allowed address projection                  | Fresh exact evidence only when publication rules permit release                            |
| Approximate            | City, region, country, and approved zone label      | Application-owned public-zone centroid for the full listing lifetime                       |
| Hidden before start    | City/region, zone, and release explanation          | Application-owned public-zone centroid until authoritative server time permits release     |
| Hidden after start     | Runtime exact projection                            | Fresh exact evidence only after authoritative server time permits release                  |
| Stale exact evidence   | Keep privacy-safe list text                         | Omit exact marker and directions link; never fall back to a privately derived coarse point |
| Ended/canceled/removed | City/region only where the public projection allows | Remove exact public geometry immediately; never retain an archived residential marker      |

Protected listings are queried and included using only their public-zone
geometry. Result inclusion, clusters, pagination, cache keys, and counts must
not depend on their private exact coordinate.

### Public-text leak safeguard

- For `APPROXIMATE_LOCATION` and pre-release `HIDDEN_UNTIL_START`, reject a
  title or description containing the private house-number/street combination.
- Normalize common street suffixes and unit punctuation for comparison while
  protecting against false positives.
- Do not echo the private address in validation messages, analytics, logs,
  error reporting, screenshots, or test snapshots.

### Anti-triangulation requirements

- Reject map bounds narrower than the smallest approved public zone and bounds
  outside the service envelope.
- Do not offer radius search, distance labels, or distance sort at launch.
- Repeated bounds, pagination, cluster counts, and result counts must remain
  stable with respect to protected exact coordinates.
- Browser geolocation remains deferred and is never persisted or logged by
  default.

### Google eligibility, credentials, CSP, attribution, and cost

- Google Maps Platform implementation is a hard gate. Obtain written Google
  Maps Platform or qualified legal confirmation covering directory use,
  Places/Geocoding storage, public reuse, exact-marker display, PostGIS
  caching, and the planned 30-day coordinate lifecycle.
- Treat the non-EEA Google terms as applicable. If approval is denied or
  materially narrower, stop and reopen provider selection.
- Continue with only `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and
  `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`; this plan does not create or rotate a
  credential. Verify presence and restrictions without printing values.
- Restrict the browser key to approved localhost origins, the stable
  Production-beta origin, and the future approved custom domain. Restrict
  enabled APIs to Maps JavaScript API, Places API (New), and the Cloud Console
  `Geocoding API` required by the Maps JavaScript Geocoding Service.
- Do not use the public browser key for server REST calls. Verify that the Map
  ID is a JavaScript Map ID with Advanced Markers enabled.
- Add a route-scoped nonce Content Security Policy through Next.js `proxy.ts`
  for `/search` and builder location routes, using only Google-documented
  script, connect, image, style, font, frame, and worker sources. Preserve
  static rendering for unrelated marketing pages.
- Preserve required Google attribution and add public Terms and Privacy links.
- Redact addresses, postal codes, coordinates, Place IDs, and API keys from
  telemetry and error reporting.
- Configure API quota caps and endpoint alerts plus billing alerts at 50%, 80%,
  90%, and 100%. Document that budget alerts do not cap spending.

Provider/legal review must use current primary sources, including the
[Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms),
[Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms),
[API key security guidance](https://developers.google.com/maps/api-security-best-practices),
[Places Autocomplete widget guidance](https://developers.google.com/maps/documentation/javascript/place-autocomplete-new),
[Advanced Markers guidance](https://developers.google.com/maps/documentation/javascript/advanced-markers/start),
and
[Google Content Security Policy guidance](https://developers.google.com/maps/documentation/javascript/content-security-policy).
Documentation links do not substitute for the required written eligibility
decision.

## 13. Public listing-detail plan

### Information hierarchy

1. Breadcrumbs.
2. Sale type, title, and active/ended state.
3. Date and time in the listing timezone.
4. Privacy-safe location and address-release explanation.
5. Cover/gallery.
6. Description.
7. Organizer display name and approved website.
8. Browse similar sale type/date and seller CTAs.

At mobile widths, title/date/location precede a long gallery so users can decide
quickly. The cover remains photo-forward, but no essential text sits directly
on a busy image without an opaque surface or tested scrim.

### Behavior to preserve

- Read only the immutable publication snapshot.
- Parse the stable `[slug]-[publicId]` route and permanently redirect stale
  slugs to the stored canonical path.
- Return not found for unpublished, removed, canceled, invalid, or mismatched
  types according to current authority.
- Re-run hidden-address projection at authoritative server time.
- Keep media authorization and variants behind the application route.
- Keep external organizer websites sanitized and `nofollow` unless policy is
  explicitly changed.

### Gallery and alt text

- Reserve 4:3/16:9 geometry and lazy-load non-critical gallery images.
- Use empty alt for a cover that duplicates adjacent title/context.
- Current data has no captions or authored alt text. Use concise
  context-appropriate fallback text without pretending to know pictured items.
- Authored descriptions/captions require a separately approved schema and
  contract.

### Expired listings

At `endsAt`:

- Remove the listing from active `/search`, selected category/home inventory,
  and sitemap.
- Keep the canonical URL as a useful 200 archive with an ended notice, dates,
  organizer, title/description, breadcrumbs, and city/region only.
- Apply `noindex` and `EventCompleted`.
- Never preserve or newly reveal a residential street address or exact marker.
- After approved media retention/cleanup, use the approved placeholder without
  changing the canonical URL.
- Do not blanket-redirect expired details to a category page.

## 14. Dashboard information architecture

### Overview order

1. Account-restricted notice, if applicable.
2. Highest-priority real next action.
3. Compact account/organizer readiness.
4. Recent real listings with workflow and publication status.
5. Create-listing action or truthful empty state.
6. Help/support link.

### Next-action priority

Use a single server-derived priority, in this order:

1. Resolve restricted/manual-review/paid-publication-blocked state.
2. Verify email when required for the next publishing action.
3. Complete organizer profile.
4. Recover payment/fulfillment state.
5. Finish the oldest recently updated incomplete draft.
6. Select a READY cover or complete another readiness requirement.
7. Review and approve the current revision.
8. Complete payment for the exact approved revision.
9. View the published listing.
10. Create a listing when no other action is pending.

Do not infer engagement priority from nonexistent analytics.

### Listings

- `/dashboard/events` uses All, Drafts, Ready for review/payment, Published,
  and Needs attention views derived from real workflow/payment states.
- Each listing shows type, title, schedule, ready-photo/cover state, approval
  readiness, human status, updated time, and one appropriate next action.
- No profile views, listing views, favorites, revenue, recommendation,
  message, alert, or upgrade panels.
- Published listings remain locked under current rules and link to the live
  detail.

### Profile and account

- `/dashboard/organizer` retains partial save, completion rules, and public vs
  private field explanations.
- `/dashboard/account` contains email status, resend verification, active
  sessions, revoke/revoke-all, password-reset path, and logout.
- Account security and organizer public identity are different navigation
  destinations.

### Authoritative status source

Dashboard badges and next actions consume the payment service's display state,
not an independently reconstructed combination of database enums. Supported
display values are:

- `DRAFT_INCOMPLETE`
- `READY_FOR_REVIEW`
- `APPROVED`
- `READY_FOR_PAYMENT`
- `CHECKOUT_CREATED`
- `PAYMENT_PENDING`
- `PAYMENT_RECEIVED_PUBLISHING`
- `PUBLISHED`
- `PAYMENT_CANCELED`
- `CHECKOUT_EXPIRED`
- `PAID_PUBLICATION_BLOCKED`
- `FULFILLMENT_RETRYING`
- `MANUAL_REVIEW_REQUIRED`

Use the user-facing labels and tones defined in `DESIGN.md`. Although
`APPROVED` is part of the display-state type, the current mapper normally
returns `READY_FOR_PAYMENT` for a currently approved event without an attempt.
The UI must render the service result rather than force an `APPROVED`
intermediate state.

### Dashboard data dependency

Define a batch application DTO for listing summaries and payment/publication
display states. Reuse existing services or add a read model at the application
boundary. A schema change is not assumed; query-plan evidence is required
before adding one.

## 15. Five-step listing-builder redesign

### Shared behavior

- Mobile header shows sale type, title/Untitled, "Step N of 5", current step,
  and a compact progress bar.
- Only accessible/complete steps are navigable according to current server
  readiness.
- A sticky bottom action area provides Back and the current primary action,
  includes safe-area padding, and reserves content space.
- Keep explicit Save and continue. Do not introduce background autosave without
  an approved contract.
- Saved-state feedback means Dirty, Saving, Saved after server confirmation,
  Not saved/Retry, or Conflict/Reload. It never claims success optimistically.
- All mutations retain `expectedVersion`; a conflict never silently overwrites.
- Never store exact addresses in local storage.

### Step 1: Details

- Show the sale type chosen during draft creation as read-only context. Changing
  it requires a separate backend-contract decision.
- Edit title (3-120 characters) and description (20-5000 characters) with
  persistent requirements and counters where helpful.
- Preserve current length validation.
- Use draft-safe error recovery and maintain entered values after recoverable
  failure.

### Step 2: Schedule

- Mobile-friendly local start/end controls and timezone context.
- Preserve DST gap/overlap validation and end-after-start.
- Explain that Checkout later requires a future start.
- Do not invent multiple daily time windows.

### Step 3: Address and privacy

- Separate private address entry from the public privacy choice.
- Explain Exact, Approximate, and Hidden until start in plain language before
  selection.
- Until the conditional Google migration is approved and implemented, preserve
  the current server Mapbox validation, confidence/error handling, and
  schedule/location timezone agreement.
- After the Google gates clear, use Places Autocomplete selection followed by
  the non-draggable pin-confirmation sequence in Section 12. A typed address is
  an unconfirmed draft, not verified provider evidence.
- Approximate and hidden modes require an approved application-owned public
  zone. Exact coordinates must never be used to derive that zone.
- Show `UNCONFIRMED`, `CONFIRMED`, or `STALE` status and a direct recovery
  action. Unconfirmed or stale locations block approval, payment, and
  publication without blocking unrelated draft edits.
- Show the same privacy projection that review/publication will use.

### Step 4: Photos

- State accepted formats, the 15MB per-file limit, and the current ordering
  contract maximum of 150 photo IDs without encouraging unnecessary
  duplicates.
- Each item shows reserved geometry, filename, upload progress, processing
  state, and a supported retry/remove action.
- Treat a photo as saved only when the server returns `READY`.
- Cover selection is explicit and limited to READY photos.
- Provide Move earlier/Move later controls and keyboard support in addition to
  any future drag interaction.
- Preserve processing, retry, ordering, cover, and deletion contracts.

### Step 5: Review and publish

- Display the exact server-projected listing and a readiness checklist.
- Link each missing requirement to the relevant step.
- Show current versioned terms and approval action.
- Before editing an approved revision, explain that approval and payment
  eligibility will be invalidated and require confirmation.
- After approval, move to the existing payment route rather than putting
  hosted Checkout in a modal.
- Success/cancel pages continue to show that provider redirect is not proof of
  publication; transitional states poll the authoritative server state.
- Published listings remain edit-locked.

## 16. Accessibility requirements

The acceptance target is WCAG 2.2 AA where applicable.

- Normal text contrast at least 4.5:1; large text, focus indicators, and
  meaningful component boundaries at least 3:1.
- Minimum interactive target 48x48px for primary mobile controls; never rely on
  a tiny icon hit area.
- One H1, logical heading order, semantic landmarks, and a skip link per page.
- Persistent labels; placeholders are examples only.
- Correct `autocomplete`, `inputmode`, input type, required/optional text, and
  helper/error associations.
- Visible focus for every interactive element; no focus clipped by sticky
  containers.
- Error summary links to fields and focus moves predictably after failed
  submission.
- Current navigation, selected filters, workflow status, validation, and
  progress use text/semantics in addition to color.
- Sheets/dialogs trap focus, close with Escape, have an explicit close control,
  block background interaction, and return focus to the trigger.
- Keyboard alternatives exist for map marker selection and photo ordering.
- Async save, upload, payment, and result-count changes use appropriate live
  regions without repeated interruption.
- Support 200% text zoom, browser zoom, mobile landscape, safe areas, and no
  horizontal page scrolling at required viewports.
- Do not disable pinch zoom or operating-system/browser map gestures.
- Under reduced motion, remove translation, scale, parallax, smooth scrolling,
  stagger, and shimmer; preserve immediate non-motion feedback.
- Under reduced transparency, replace blur/glass with opaque contrast-safe
  surfaces.
- Manual acceptance includes keyboard-only, NVDA/Windows screen-reader
  sampling, touch, and high-contrast checks. Adding an automated axe package is
  a dependency approval gate.

## 17. Performance requirements

### User-facing targets

- Core Web Vitals target at p75 mobile: LCP <= 2.5s, INP <= 200ms, CLS <= 0.1.
- No horizontal overflow at 360, 390, or 430px.
- Visible press feedback begins within 100ms.
- Existing usable content stays on screen during pagination/retry.
- A map error never prevents access to server-rendered results.

### Route strategy

- Keep public and marketing content server rendered.
- Keep `/search` list HTML useful before hydration.
- Dynamically import Google Maps JavaScript only for map view; list view must
  make no Google script, tile, Place, Geocoding, or marker request.
- Load Places only on the Address and Privacy builder step. Provider failure
  must not hydrate unrelated builder steps or public routes.
- Split the monolithic builder/auth client components so each route hydrates
  only the interaction it needs.
- Batch dashboard summary/status retrieval.
- Use cursor pagination and bounded page sizes; do not render the entire
  inventory.

### Media and layout

- Use existing sanitized WebP variants where appropriate.
- Reserve card, cover, gallery, map, sheet, and skeleton geometry.
- Prioritize at most one above-the-fold image.
- Lazy-load below-the-fold galleries and marketing media.
- Use Manrope through `next/font` with the needed subset and system fallback;
  avoid runtime font requests.
- Avoid pervasive backdrop filters and animated shadows.

### Measurement

- Capture a baseline before each phase and record deltas for route JS, LCP,
  CLS, and key server query timing.
- Use current build output and browser performance traces without adding a
  package.
- Lighthouse CI, a bundle analyzer, or third-party RUM is a separate dependency
  or provider approval.
- Search/map query plans must be reviewed with representative inventory before
  launch. Add indexes only through a separately approved migration.

## 18. SEO metadata, canonical, sitemap, robots, structured-data, and expired-page rules

### Production-beta indexing safety

- Phase 1 established a testable application-level robots policy for the stable
  Production beta. Preserve its fail-closed handling for every deployed
  environment path.
- The policy is fail-closed for every deployed environment by default. Merely
  removing `PRODUCTION_BETA_MODE` or changing Stripe mode must never enable
  indexing.
- During Phases 1-7, every rendered page remains `noindex`; sensitive routes
  are `noindex,nofollow`.
- Do not disallow all pages in `robots.txt` while relying on meta noindex;
  crawlers need to fetch a page to see the directive.
- Phase 8 may prepare public metadata, robots, and sitemap behavior, but
  enabling eligible Production routes requires a separate owner-approved
  code/configuration change.
- Until that approval, tests prove beta pages are noindex and no beta sitemap
  advertises public URLs.
- Before launch, robots allow crawlers to retrieve public pages so they can see
  meta noindex, and no sitemap is advertised. After launch approval,
  `robots.txt` allows eligible public content, keeps `/search` fetchable for its
  `noindex,follow`, may disallow sensitive application/API/test path families,
  and declares the canonical `/sitemap.xml`. Robots rules are never access
  control.

### Titles and descriptions

- Use unique, intent-led titles with the primary topic and Bakersfield where
  natural; keep the brand suffix consistent.
- Descriptions summarize the page's real value and next action without
  inventory counts or claims that can go stale.
- Each page has one descriptive H1 aligned with its title but not mechanically
  duplicated.

### Canonicals

- Homepage and marketing pages self-canonicalize.
- `/estate-sales` and `/yard-sales` self-canonicalize.
- Filtered `/search` URLs are always `noindex,follow` and canonicalize to
  `/search`; category pages, not query combinations, are indexable targets.
- Listing details use the immutable stored canonical path and retain permanent
  stale-slug redirects.
- Auth, dashboard, payment, preview, admin, and test routes remain noindex and
  outside the sitemap.

### Sitemap and robots

- Sitemap includes only owner-approved homepage/marketing/category pages and
  active/upcoming eligible listing canonicals.
- Remove canceled, removed, and ended listings from the sitemap.
- Do not generate sitemap entries for `/search`, filters, cursors, map views,
  auth, application, API, or media routes.
- Robots policy must not expose private route details or serve as access
  control.

### Structured data

- Site shell: `Organization` and `WebSite` only with approved factual fields.
- Category/detail: `BreadcrumbList`.
- Active listing detail: existing `Event` with projected public location,
  correct status, dates, image, organizer, and canonical URL.
- Expired detail: `EventCompleted`, city/region-only location, and noindex.
- FAQ: `FAQPage` only when the same approved questions/answers are visibly
  rendered and current.
- Never emit exact hidden/approximate address data into JSON-LD.

### Social metadata

- Define a default Open Graph/Twitter image and page-specific title,
  description, canonical URL, and image where available.
- Listing social images use authorized published media only.
- Expired or missing media uses the approved default; no broken private URL.

### Local SEO and internal linking

- Keep business name, service area, and contact facts consistent with approved
  business sources.
- Link homepage -> categories -> selected listings -> related category/search;
  seller content -> how it works -> signup; support questions -> FAQ/contact.
- Use breadcrumbs on public details and substantive nested content.
- Add surrounding-area pages only after the inventory/content gate in Section 9.

### Image search and Core Web Vitals

- Use meaningful surrounding captions/context and the most accurate alt text
  available from current data.
- Do not fabricate image subjects from filenames or position.
- Stable geometry, responsive media, server HTML, deferred map/gallery work,
  and limited client JS are SEO requirements as well as performance work.

## 19. Test and visual-regression strategy

### Preserve the current baseline

Retain unit, Test-Neon integration, Blob/email/location/image/Stripe contract,
architecture, lint, type, build, and Playwright verification. UI work must not
weaken ownership, verification, privacy, upload, approval, payment, webhook, or
publication assertions.

### New test layers

| Layer       | Scope                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Date/url normalization, status mapping, next-action priority, privacy-safe marker projection, cursor encoding/ordering       |
| Integration | Published-only search, cancellation/removal/expiry, list/marker identity, privacy non-leakage, batch dashboard summary       |
| Contract    | Single public search/card/marker response and browser-map boundary                                                           |
| E2E         | Navigation, auth states, category links, list/map/filter/back behavior, detail privacy, dashboard, builder, payment recovery |
| Metadata    | Robots, canonicals, OG/Twitter, sitemap inclusion, structured-data parsing, expired status                                   |
| Visual      | Deterministic screenshots for core states/viewports                                                                          |
| Manual      | Keyboard, NVDA, touch, zoom, landscape, reduced motion/transparency, slow/error states                                       |

### Required viewports

- Mobile: 360px, 390px, and 430px widths.
- Tablet: 768px portrait and a landscape/tablet-width check.
- Desktop: 1280px; use 1440px for dense search/dashboard acceptance.

Current Playwright has one serialized Desktop Chrome project. Add explicit
viewport projects or parameterized suites while preserving provider-heavy test
serialization.

### Visual baseline policy

- Use built-in Playwright screenshots; no dependency is required.
- Use deterministic Test-Neon fixtures and captured email/media/fake Checkout.
- Freeze or mask timestamps, random IDs, processing animation, and other
  nondeterministic values.
- Do not compare live Google tiles pixel-for-pixel. Normal unit, integration,
  contract, E2E, and visual tests use fake Google adapters and make no live
  Google calls. Test live map controls and markers semantically only during an
  explicitly approved Production-beta smoke.
- Review intentional baseline changes with the relevant phase; never bulk
  accept unrelated differences.

### Critical search/privacy assertions

- Unpublished events and paid attempts without a publication never appear.
- Canceled, removed, and ended listings do not appear in active results.
- List and map use identical listing IDs for the same normalized criteria.
- Every Friday-Sunday preset and DST boundary is correct.
- Cursor order is stable and duplicates/gaps are absent.
- Approximate and hidden listings never serialize street, raw coordinate,
  provider data, or exact-distance leakage.
- List view does not load Google scripts, tiles, Places, Geocoding, or marker
  geometry.
- Duplicate, unknown, malformed, over-length, out-of-envelope, and
  too-narrow-bounds requests are rejected before database work.
- List and map limits, cursor binding, 31-day custom-date cap, `429`
  `Retry-After`, and fail-closed limiter behavior are deterministic.
- Repeated bounds, cursor, pagination, and cluster queries cannot distinguish a
  protected listing's exact point.
- Approximate and hidden listings use only their selected application-owned
  zone for inclusion, marker geometry, counts, clusters, and cache keys.

### Conditional Google location assertions

- Autocomplete requests use the minimum field set and a valid widget/session
  lifecycle; stale selections cannot win a race.
- Selecting a Place does not confirm a location until the organizer accepts
  the non-draggable pin and the server authorizes the transition.
- Address changes invalidate confirmation and require reselection.
- A Google failure produces an unconfirmed draft and blocks approval, payment,
  and publication without blocking unrelated draft edits.
- Only an authenticated administrator can use interactive Geocoding fallback,
  and its provenance is recorded.
- Coordinate evidence expires, is purged from scalar and PostGIS forms, and is
  never silently queried after expiry.
- Same-Place-ID evidence refresh does not invalidate approval; a changed Place
  ID, address, privacy mode, or public zone does.
- Exact, approximate, hidden-before-start, hidden-after-start, stale,
  canceled, removed, ended, and expired projections have explicit coverage.
- Protected titles/descriptions containing the private house-number/street
  combination are rejected without echoing the address.
- Missing/invalid key, unauthorized referrer, invalid Map ID, quota, billing,
  CSP, Places, Geocoding, and script-load failures all preserve the usable
  server-rendered list.
- HTML, RSC payloads, API responses, metadata, JSON-LD, logs, error reporting,
  screenshots, and snapshots never leak a credential, private address, postal
  code, Place ID, or unauthorized coordinate.

## 20. Production-beta review workflow

This describes the approved future hosted-review path; this planning document
does not authorize a merge or deployment. Vercel Preview deployments,
Preview-specific provider resources, and additional phase branches are not
part of the workflow.

1. Complete local and CI gates for the current implementation phase.
2. Commit the phase on `feature/ui-ux-overhaul`; do not create another phase
   branch.
3. Stop for owner review. After explicit approval, verify that `main` can be
   fast-forwarded to the approved commit without a merge commit or force push.
4. Fast-forward and push `main`; allow Vercel to deploy the existing stable
   Production-beta URL using its existing Production environment variables and
   provider resources. Do not create or rotate provider credentials.
5. Confirm the deployed commit and deployment are `READY`, then verify
   `/api/health` returns HTTP 200.
6. Verify Production-beta `noindex` and sensitive-route
   `noindex,nofollow` behavior before visual review. Do not advertise a public
   sitemap.
7. Review at 360, 390, 430, 768, 1280, and 1440 where relevant.
8. Review touch, keyboard, NVDA sample, 200% text zoom, mobile landscape,
   reduced motion/transparency, slow network, empty/error/conflict states, and
   safe-area spacing.
9. Run the phase's provider-safe smoke with controlled test data, inspect
   Production error logs, and avoid any real payment or publication side
   effect not explicitly approved.
10. Record the deployed commit, deployment ID, sanitized screenshots, test
    results, unresolved issues, and owner decision.

An unavailable required provider or failed safety gate is `BLOCKED`, not
passing. Production beta remains `noindex`; public indexing, a custom-domain
launch, and live-provider changes require separate approval.

## 21. Phased implementation roadmap

| Phase                                                    | Outcome                                                                                | Principal dependency                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1. Design foundation and application shells              | Tokens, base primitives, indexing safety, and public/auth/dashboard/builder shells     | Approved DESIGN and no new UI dependency                                      |
| 2. Authentication                                        | Cohesive mobile-first auth/recovery/session presentation                               | Existing auth contracts remain unchanged                                      |
| 3. Homepage and marketing pages                          | Public story, category/marketing content, and a functional default/sale `/search` list | Approved copy/legal/service content and G3 list slice                         |
| 4. Shared search and map                                 | Extend the list contract; add a lazy Google map only after every hard gate clears      | G3-G6, G12-G14, public zones, expiring evidence, CSP, and query plans         |
| 5. Public listing details                                | Photo-forward, privacy-safe, canonical active/expired detail                           | Existing snapshot plus approved expired projection                            |
| 6. Organizer dashboard                                   | Workflow-led overview/listings/profile/account                                         | Batch summary DTO; no analytics                                               |
| 7. Listing builder                                       | Five focused steps; add Places and pin confirmation only after every hard gate clears  | Existing event/photo/payment contracts plus G12-G14 for the location workflow |
| 8. SEO, accessibility, performance, and final regression | Launch-ready verification while retaining beta noindex until approval                  | Content/inventory/SEO launch gate                                             |

Phases 1 and 2 are implemented in the audited baseline; their criteria below
remain regression requirements. Public marketing and search work present in
the working tree is not treated as accepted merely because it exists. No
remaining phase begins automatically, and each stops for evidence and approval.

## 22. Acceptance criteria for every phase

### Phase 1: Design foundation and application shells (completed; regression gate)

**Routes and files affected**

- `src/app/layout.tsx`, `src/app/globals.css`, global error/loading/not-found
  surfaces as approved.
- New shared primitives and shell files under `src/components/`.
- `src/app/dashboard/layout.tsx` and focused shell boundaries as needed.
- Robots-policy helper/tests to keep Production beta and any legacy deployed
  environment fail-closed `noindex`.

**Components**

- Tokens, Button/Link, fields, status/alert, skeleton, sheet/dialog foundation,
  PublicShell, AuthShell, DashboardShell, BuilderShell.

**Backend/data dependencies**

- None. Do not alter schemas or existing contracts.
- The Phase 1 policy is noindex by default for deployed builds and does not
  infer launch from the beta flag. No new public environment variable is
  introduced; the eventual indexing enablement remains G11.

**Tests required**

- Existing foundation/security-header tests.
- Token/focus/landmark/navigation/noindex tests.
- Shell screenshots at required viewports.
- Reduced-motion and safe-area behavior.

**Mobile acceptance**

- No overflow at 360/390/430.
- 48px controls, readable 16px form text, one H1, skip link, sticky elements
  leave content clear.

**Tablet/desktop acceptance**

- Shells change hierarchy at content-driven breakpoints; max-widths and
  sidebars follow `DESIGN.md`.

**Accessibility**

- Keyboard reaches all shell navigation in logical order; focus is always
  visible; current page is announced.

**Production-beta review**

- Optional only after local/CI pass and explicit approval; follow Section 20
  and verify noindex before reviewing.

**Stop condition**

- Stop after token/shell/noindex evidence and owner approval. Do not start auth.

### Phase 2: Authentication (completed; regression gate)

**Routes and files affected**

- `/signup`, `/login`, `/verify-email`, `/forgot-password`,
  `/reset-password`.
- Split presentation responsibilities from
  `src/app/_components/auth-forms.tsx`.

**Components**

- AuthShell, auth fields, password control, ErrorSummary, status panels,
  submitting/success/recovery states.

**Backend/data dependencies**

- Existing auth APIs, token lifetimes, abuse controls, cookies, safe redirects,
  and session contracts only.

**Tests required**

- Existing auth unit/integration/E2E suites.
- Every visual/loading/error/token state; scanner-safe GET; keyboard flow;
  autocomplete/inputmode; first-error focus.

**Mobile acceptance**

- Complete all five flows at 360/390/430 with no obscured keyboard action,
  clipped error, or horizontal scroll.

**Tablet/desktop acceptance**

- Supporting panel never overwhelms the form; form measure remains readable.

**Accessibility**

- Labels, descriptions, errors, live regions, password control, and focus
  transitions pass manual keyboard/NVDA sampling.

**Production-beta review**

- After the Section 20 approval and deployment gates, use a controlled test
  recipient to repeat registration, verification, reset, prior-session
  revocation, and safe failures.

**Stop condition**

- Stop after auth lifecycle regression and owner review. Do not start
  marketing.

### Phase 3: Homepage and marketing pages

**Routes and files affected**

- `/`, `/estate-sales`, `/yard-sales`, `/how-it-works`, `/list-your-sale`,
  `/about`, `/faq`, `/contact`, `/privacy`, `/terms`, plus the functional
  default/sale-list slice of `/search`.
- Shared public header/footer and marketing components.

**Components**

- HeroSearch, CategoryLinkCard, SelectedListings, ListingCard, SellerCTA,
  ProfessionalServiceCTA, trust/FAQ sections.

**Backend/data dependencies**

- G3 approval for the first slice of the single `public-search` boundary:
  published-only selected listings, `PublicListingCardProjection`, sale type,
  soonest order, and bounded result count.
- The same slice powers a functional server-rendered `/search` default/sale
  list so marketing/category links are not broken. Phase 4 extends it with the
  rest of the approved query, cursor, and map contract.
- Approved legal/marketing copy, static contact destination, and Simply
  Decorated link.
- Use non-numeric publication-fee timing copy. A numeric public fee requires a
  separately approved read-only pricing source; the authenticated per-event
  payment-status contract must not be repurposed.
- No fabricated inventory, fee, testimonial, or claim.

**Tests required**

- Unique metadata/H1/canonicals, internal links, category-to-search URLs,
  external CTA semantics, functional server-rendered default/sale search
  destinations, SSR content, empty inventory, responsive media, and visual
  baselines.

**Mobile acceptance**

- Primary shopper and seller paths are visible within the opening experience
  at 360/390/430; cards scan without horizontal carousels as the only access.

**Tablet/desktop acceptance**

- Hero/content composition uses whitespace and photos without excessive glass
  or stretched text.

**Accessibility**

- Logical headings/landmarks, descriptive links, external destination clarity,
  keyboard order, and contrast pass.

**Production-beta review**

- After the Section 20 approval and deployment gates, review every claim, legal
  page, empty inventory state, and service CTA with the owner.

**Stop condition**

- If G2 or the Phase 3 slice of G3 is unapproved, stop before the affected
  route/inventory work. Otherwise stop when copy, routes, functional links,
  screenshots, and noindex state are approved. Do not start the
  date/location/cursor/map extension.

### Phase 4: Shared search and map

**Routes and files affected**

- Extend the Phase 3 `/search` page/loading/error surfaces.
- Extend the Phase 3 public-search application/repository boundary.
- Extend the existing `GET /api/search` adapter with the gated map projection
  described in Section 10.
- Search/list/filter/date/map components.
- Provider-neutral location contracts, future forward-only migration,
  public-zone seed source, expiring-evidence cleanup, route-scoped CSP, and
  environment parsing only after separate approval.

**Components**

- ListingCard/List/Grid, view toggle, filter/date sheets, chips, cursor
  controls, map loader/map/controls/markers/clusters/preview.

**Backend/data dependencies**

- Approved normalized query/response/cursor contract.
- Published-only repository query and representative query plans.
- Approved application-owned public zones, marker privacy, exact release,
  evidence expiry, anti-triangulation, and public-text leak rules.
- Written Google/provider eligibility; approved Maps JavaScript/Places terms;
  restricted browser key and Map ID; allowed origins; route-scoped CSP;
  attribution; quotas, billing alerts, and Production-beta configuration.
- Approved forward-only schema migration separating first-party location state
  from expiring provider evidence. No schema/index change is implicit.

**Tests required**

- URL/date/cursor unit tests; published-only integration tests; shared
  list/marker contract; privacy non-leakage; list/map/back/filter E2E; SSR HTML;
  map/provider/CSP/quota failure; no-results; response-schema/version, abuse,
  bounds, cursor, and page-cap tests; coordinate-expiry and public-zone tests;
  proof list responses contain no geometry and list view loads no Google
  resources. Use fake adapters for automated tests.

**Mobile acceptance**

- Full list and map flows work at 360/390/430 with 48px controls, filter/date
  sheets, one-thumb toggle, safe-area clearance, and accessible marker preview.

**Tablet/desktop acceptance**

- Tablet remains usable without cramped split; desktop map split synchronizes
  selection and criteria without hover dependency.

**Accessibility**

- Results summary/live changes are controlled; map has a list alternative;
  keyboard can select controls/markers and escape previews; focus returns.

**Production-beta review**

- Only after every hard gate and the Section 20 deployment approval, use
  controlled provider-safe fixtures; inspect key restrictions without printing
  values, network exposure, attribution, safe markers, bounds behavior, query
  timing, Google failure fallback, error logs, and screenshots.

**Stop condition**

- The date/list/cursor extension may be reviewed independently. If any
  provider-eligibility, storage, credential, migration, public-zone, privacy,
  dependency, CSP, abuse, cost, or query-plan gate is unapproved, retain
  `MAP_PROJECTION_UNAVAILABLE` and stop before map implementation. Otherwise
  stop after the shared search review; do not begin detail redesign.

### Phase 5: Public listing details

**Routes and files affected**

- `/estate-sales/[listing]`, `/yard-sales/[listing]`.
- `public-event-listing.tsx`, metadata helpers, shared gallery/location/date
  components.

**Components**

- Breadcrumbs, ListingHeader, ScheduleSummary, PrivacyLocation, Gallery,
  OrganizerSummary, ExpiredNotice, related-search CTA.

**Backend/data dependencies**

- Existing immutable snapshot and runtime projection.
- Approved expired/archive projection and media-retention behavior.
- Authored image alt/caption data remains a separate schema gate.

**Tests required**

- Existing publication/privacy E2E and integration.
- Canonical redirects, OG/Twitter, Event/Breadcrumb JSON-LD, exact/approximate/
  hidden/expired states, media placeholder, active-vs-ended indexing, and
  screenshots.

**Mobile acceptance**

- Title/date/privacy information remains clear before long gallery content at
  360/390/430; no image-driven layout shift.

**Tablet/desktop acceptance**

- Gallery and information measure remain coherent; no over-wide text or
  inaccessible lightbox.

**Accessibility**

- Privacy state is textual, images have accurate available alternatives,
  breadcrumbs/heading order pass, and gallery is keyboard usable.

**Production-beta review**

- After the Section 20 approval and deployment gates, review controlled
  listings in every privacy state and a simulated expired state without
  exposing private addresses.

**Stop condition**

- Stop after canonical/privacy/expired/visual approval. Do not start dashboard.

### Phase 6: Organizer dashboard

**Routes and files affected**

- `/dashboard`, `/dashboard/events`, `/dashboard/events/new`,
  `/dashboard/organizer`, `/dashboard/account`.
- Dashboard shell, organizer form, session management, listing summary
  components.

**Components**

- PriorityActionPanel, readiness, listing cards/filters/status, empty states,
  SessionList, OrganizerProfileForm.

**Backend/data dependencies**

- Approved batch organizer-listing/payment summary DTO.
- Existing account, organizer, event, payment, ownership, and restriction
  rules.
- No analytics model.

**Tests required**

- Existing ownership/auth/payment tests.
- Every real next action/display state, empty/restricted/unverified/incomplete
  profile, list filters, session actions, no unsupported metrics, and visual
  baselines.

**Mobile acceptance**

- Overview, listings, create, profile, and account work at 360/390/430 with
  labeled bottom navigation and scannable stacked cards.

**Tablet/desktop acceptance**

- Sidebar appears without duplicate bottom navigation; listing rows remain
  readable and actions unambiguous.

**Accessibility**

- Current navigation, status, action priority, table/card semantics, and
  keyboard order pass.

**Production-beta review**

- After the Section 20 approval and deployment gates, review controlled
  accounts across restricted, unverified, incomplete, draft, payment, blocked,
  and published states.

**Stop condition**

- If G7 is unapproved, stop before replacing current summary retrieval. Stop
  after dashboard data/UX regression and owner approval. Do not start builder.

### Phase 7: Listing builder

**Routes and files affected**

- `/dashboard/events/[eventId]/edit`, preview, payment, success, cancel.
- Split `event-builder.tsx`, `payment-panel.tsx`, wizard/photo client-state
  helpers, and builder styles.

**Components**

- Five step components, compact progress, sticky actions, save state, error
  summary, upload queue/photo item/order/cover, readiness, invalidation dialog,
  payment status.

**Backend/data dependencies**

- Existing event/photo/location/approval/payment APIs and `expectedVersion`.
- No autosave, payment, or publication rule change is assumed.
- Places selection, pin confirmation, unconfirmed/stale states, provider
  evidence, and public zones are a separately gated location-domain migration;
  retain current Mapbox behavior until G12-G14 are all satisfied.

**Tests required**

- Current wizard/photo/payment unit and integration suites and broad E2E.
- Mobile step layouts, sticky clearance, conflict/error focus, upload
  retry/processing, keyboard ordering, cover gating, approved-edit
  invalidation, offline/timeout recovery, and all payment states.
- When the location migration is approved: autocomplete/session/field-mask
  behavior, pin confirmation, reselection, provider failure, unconfirmed/stale
  blocking, controlled admin Geocoding, evidence expiry, and address-leak
  safeguards.

**Mobile acceptance**

- Complete every step at 360/390/430; mobile keyboard does not hide actions;
  progress is compact; exact address is not persisted locally; upload states
  remain readable.

**Tablet/desktop acceptance**

- Forms gain space without turning into a dense desktop control wall; review
  remains faithful to public projection.

**Accessibility**

- Field errors, progress, upload updates, photo ordering, dialogs, sticky
  actions, and payment polling announcements pass keyboard/NVDA sampling.

**Production-beta review**

- After the Section 20 approval and deployment gates, repeat the complete
  builder workflow with controlled provider-safe location data, existing Blob,
  Stripe test, and publication states.

**Stop condition**

- Stop after all five steps, payment/publication regression, and owner approval.
  Do not start launch validation automatically.

### Phase 8: SEO, accessibility, performance, and final regression

**Routes and files affected**

- Root/public metadata helpers, `robots.ts`, `sitemap.ts`, structured-data and
  expired-page logic, loading/error/not-found surfaces, Playwright visual
  suites, and approved performance tooling/configuration.

**Components**

- Metadata/structured-data helpers, ExpiredNotice, route state surfaces, final
  accessibility refinements.

**Backend/data dependencies**

- Approved sitemap/publication query, expired projection, inventory/content
  threshold, public launch decision, and any approved monitoring/tool
  dependency.

**Tests required**

- Full repository verification; metadata/robots/sitemap/structured-data;
  visual suite; broken-link crawl; keyboard/NVDA/zoom/landscape/reduced settings;
  performance budgets; provider-safe Production-beta regression.

**Mobile acceptance**

- All launch routes pass 360/390/430 content, interaction, visual, zoom,
  landscape, and CWV review.

**Tablet/desktop acceptance**

- All launch routes pass 768/1280/1440 composition, keyboard, visual, and
  performance review.

**Accessibility**

- WCAG 2.2 AA checklist is complete with documented manual evidence and no
  unresolved critical/serious issue.

**Production-beta review**

- After the Section 20 approval and deployment gates, run the complete stable
  Production-beta workflow and retain sanitized evidence.
- Confirm Production-beta noindex before and after all tests.

**Stop condition**

- Stop with Production beta still noindex. Enabling indexing, merging to main,
  or Production deployment requires separate explicit approval.

## 23. Risks, prerequisites, and approval gates

### Approval gates

| Gate                                 | Required decision                                                                                                                 | Blocks                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| G1: Indexing safety                  | Approve fail-closed Production-beta robots policy and tests                                                                       | Any public visual rollout                            |
| G2: Content/legal                    | Approve marketing claims, legal pages, FAQ, contact details, service CTA, and Google-required public terms/privacy links          | Phase 3 acceptance and Google surfaces               |
| G3: Public search contract           | Approve list/map transport, DTOs, cursor, filters, validation, abuse boundary, and versioning                                     | Phase 4                                              |
| G4: Marker privacy/security          | Approve public zones, exact release, evidence expiry, anti-triangulation, text-leak protection, logging, caching, and rate limits | Map and spatial filters                              |
| G5: Google browser configuration     | Approve Maps JavaScript/Places integration, key/Map ID restrictions, origins, CSP, attribution, quota caps, and billing alerts    | Any Google browser request                           |
| G6: Database/query plan              | Approve representative query plans and every schema/index migration                                                               | Search/map launch if current storage is insufficient |
| G7: Dashboard summary                | Approve the batch organizer-listing/payment summary DTO and bounded repository strategy                                           | Phase 6                                              |
| G8: Expired projection               | Approve archive fields, address removal, media retention, cache behavior, and EventCompleted metadata                             | Phase 5/8                                            |
| G9: Optional tooling                 | Approve axe, Lighthouse CI, bundle analyzer, RUM, or another dependency/provider                                                  | Only the related automated check                     |
| G10: Production-beta hosted review   | Approve fast-forwarding `main` and using the stable Production-beta deployment for a controlled hosted smoke                      | Hosted phase review                                  |
| G11: Public launch/indexing          | Approve inventory, content, privacy, SEO, accessibility, performance, robots, sitemap, and live-mode posture                      | Removing noindex and public launch                   |
| G12: Google provider eligibility     | Obtain written Google Maps Platform or qualified legal confirmation for directory use, storage, reuse, exact display, and caching | All Google implementation                            |
| G13: Provider-data lifecycle         | Approve durable first-party fields, transient Google fields, 30-day coordinate purge, Place-ID refresh, and legacy handling       | Location schema, organizer Places, and map           |
| G14: Location migration and rollback | Approve forward-only schema/data migration, application-owned zone source, cleanup job, legacy Mapbox treatment, and rollback     | Replacing current Mapbox runtime                     |

### Primary risks and mitigations

| Risk                                                               | Consequence                         | Mitigation                                                                                        |
| ------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| Private location leaks through markers, distance, counts, or cache | Residential privacy harm            | Application-owned DTO, coarse-marker review, anti-triangulation tests, server time, log redaction |
| Separate list/map logic drifts                                     | Conflicting inventory and filters   | One normalizer, service, cursor, projection, and contract                                         |
| Raw publication snapshot is serialized                             | Hidden exact address exposure       | Parse and project server-side; contract tests reject private keys                                 |
| Production beta is indexed early                                   | Thin/incomplete pages enter search  | Implement G1 first; launch change remains separate                                                |
| Google directory use is not contractually eligible                 | Suspension, billing, or legal risk  | G12 written confirmation is a hard stop; reopen provider selection if denied                      |
| Google provider data is retained beyond approved terms             | Compliance and privacy exposure     | Separate expiring evidence, purge coordinates/PostGIS by 30 days, and test stale removal          |
| One public browser key is used from a server                       | Unrestrictable credential exposure  | Keep it website-restricted; use JavaScript services only; require separate approval for server ID |
| Map bundle harms mobile list performance                           | Poor 90% mobile experience          | Lazy import; assert no Google network or geometry in list view                                    |
| Dashboard redesign invents product data                            | Misleading organizer experience     | Real next-action/status DTOs only                                                                 |
| Monolithic refactor changes business behavior                      | Auth/payment/publication regression | Incremental presentation extraction and existing integration/E2E suites                           |
| Expired page retains street address                                | Long-lived residential disclosure   | City/region archive projection and exact-marker removal                                           |
| Search queries do not scale                                        | Slow SSR and map refresh            | Representative query plans, bounded page size, cursor, gated indexes                              |
| Visual snapshots become flaky                                      | Low-trust regression signal         | Deterministic fixtures, masked dynamic data, deterministic map surface                            |
| New dependency expands security/maintenance surface                | Unreviewed risk                     | Dependency approval and no-library default                                                        |
| Thin location pages become doorway pages                           | SEO quality penalty and poor trust  | Inventory/content threshold and owner review                                                      |

### Recommended next implementation prerequisite

Do not begin Google implementation. First:

1. Obtain and archive the G12 written provider-eligibility decision.
2. Approve G13's exact field-retention, 30-day coordinate/PostGIS purge, and
   Place-ID refresh rules.
3. Approve the licensed Bakersfield `PublicLocationZone` source and G14
   forward-only migration/rollback posture.
4. Verify the asserted browser key and Map ID restrictions without printing
   values; approve the route-scoped CSP, attribution, quotas, and billing
   alerts.
5. Only then plan the smallest implementation commit: provider-neutral
   location-domain contracts, fake adapters, migration, and expiry tests.

If any provider gate is denied or materially narrower than this plan, keep the
current Mapbox runtime and `MAP_PROJECTION_UNAVAILABLE`, stop, and reopen
provider selection.
