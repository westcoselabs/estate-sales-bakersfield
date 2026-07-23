# Estate Sales Bakersfield UI/UX Overhaul Implementation Plan

**Status:** Planning only; no implementation is authorized by this document

**Branch:** `feature/ui-ux-overhaul`

**Normative design source:** root `DESIGN.md`

**Primary viewport:** 360-430px, progressively enhanced for tablet and desktop

**Production posture:** Production is out of scope and must not be changed

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
- The initial list response is server rendered where practical. Mapbox and
  other heavy client code are loaded only when needed.
- Existing authentication, organizer, event, photo, approval, payment,
  privacy, and publication rules remain authoritative.
- Production beta stays `noindex` until the SEO, content, inventory, privacy,
  and launch gate is explicitly approved.

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

| Surface                           | Current state                                                                      | Primary UX issue                                                                                | Overhaul response                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/`                               | Minimal seller-first account prompt                                                | No shopper path, search, trust content, shared navigation, or local marketplace story           | Build a mobile-first discovery homepage with search, Explore, Map, seller, and trust paths |
| `/estate-sales` and `/yard-sales` | Placeholder hubs                                                                   | No useful editorial content or upcoming inventory                                               | Convert to category landing pages that link into filtered `/search`                        |
| Public detail                     | Functional snapshot-based page                                                     | Weak hierarchy, raw images, generic gallery alt text, no shared shell or expired treatment      | Redesign presentation without changing snapshot authority                                  |
| Authentication                    | Complete workflows in a large shared client file                                   | Dense generic cards, inconsistent recovery hierarchy, limited mobile state design               | Split presentation components and use one calm auth shell                                  |
| `/dashboard`                      | Verification, onboarding, drafts, payment states, sessions, and logout on one page | Competing priorities and excessive cognitive load                                               | Separate overview, listings, profile, and account/security                                 |
| Event builder                     | One 1,542-line client component                                                    | Five full step buttons collapse into a long mobile list; dense upload/form states               | Split by step and add compact progress, sticky actions, and recovery states                |
| Payment                           | Correct authority and polling                                                      | Operational states are visually flat and raw                                                    | Map only real display states to consistent status panels and next actions                  |
| Navigation                        | No shared public or application shell                                              | Users lack orientation and predictable destinations                                             | Add public, auth, dashboard, and focused-builder shells                                    |
| CSS                               | One 562-line global stylesheet with broad element selectors                        | Brittle page composition, hard-coded values, one desktop-first breakpoint                       | Implement approved semantic tokens and component-scoped styles                             |
| Testing                           | Strong unit/integration/provider contracts and broad desktop E2E                   | No mobile projects, visual baselines, automated accessibility, SEO crawl, or performance budget | Add deterministic viewport, visual, semantic, SEO, and performance checks                  |

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
- There is no public collection repository, `/search` contract, browser map,
  client Mapbox token, `robots.ts`, or `sitemap.ts`.
- Root metadata is indexable by default. The Production beta flag currently
  constrains Stripe configuration, but application code does not apply a
  global beta `noindex`. Correcting this is the first indexing-safety task.

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
- Phase 3 creates the first bounded list slice of one application-owned public
  search contract and a functional default `/search` destination. Phase 4
  extends that exact contract with dates, location, cursors, and markers.
- `GET /api/search` is the single read-only client transport for pagination and
  lazy map data. Server components call the same application service directly;
  the route handler is an adapter, never a second query path.
- `src/app/robots.ts` and `src/app/sitemap.ts` are planned in Phase 8, with an
  early beta/preview noindex guard in Phase 1.
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

Create one `public-search` application boundary. Phase 3 implements its
published-only sale-type/default-list slice; Phase 4 extends, rather than
replaces, it with:

- `normalizeSearchQuery(raw, now, timezone)`
- `searchPublishedListings(criteria, now)`
- `PublicListingCardProjection`
- `PublicMapMarkerProjection`
- `PublicSearchPage` containing normalized criteria, list items, page
  information, and optional map-page data

The repository selects immutable `EventPublication` rows, joined only to
authoritative event/location fields needed for structured filters,
cancellation/removal, schedule, and approved marker derivation. It must never
select draft/workflow/payment state as a substitute for publication.

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
- The response has `schema: "public-search-v1"`, normalized criteria, at most
  24 list items, opaque page information, and optional `mapPage`.
- `projection=list` never returns marker geometry.
- `projection=map` returns the same current cursor page plus one privacy-safe
  marker for each item. The initial release therefore caps markers at 24,
  cluster counts describe only that page, and `pageInfo.hasNext` communicates
  additional matching pages.
- "Search this area" adds approved bounds, resets the cursor, and returns a new
  page whose item IDs and marker IDs match. A future all-viewport aggregation
  is a versioned contract extension, not a parallel implementation.
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
| `bounds`     | Approved encoded bounds                            | Omitted                  | Gated with map-query privacy controls                         |
| `radius`     | Approved bounded miles                             | Omitted                  | Gated; never imply current support                            |

Defaults are omitted from generated links. Applying filters or a view change
pushes meaningful history. Opening/closing a sheet does not. Map panning is
ephemeral until the user selects "Search this area"; only that action may update
approved bounds state.

Malformed public URLs normalize to safe defaults where unambiguous. Invalid
custom dates produce an accessible inline error and do not issue a misleading
query.

### Rendering and client boundaries

- `/search` is a server component that parses URL state and renders the initial
  list, summary, active filters, and empty/error state as HTML.
- Search controls use small client islands for sheets, date selection, URL
  updates, and focus management.
- `SearchMap` is dynamically imported only when map view is requested or a
  desktop split view explicitly needs it.
- List view must not download Mapbox JS/CSS or request tiles.
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
- Failed map loading leaves the server-rendered list usable.
- Failed pagination leaves existing results in place and provides Retry.
- Do not replace a public error with fabricated inventory.

## 11. Supported filters and date behavior

### Capability matrix

| Capability                 | Data exists                         | Public contract exists now | Phase 4 disposition                                        |
| -------------------------- | ----------------------------------- | -------------------------- | ---------------------------------------------------------- |
| Estate/yard sale type      | Yes                                 | No                         | Implement in the new shared contract                       |
| Today/custom date overlap  | Yes                                 | No                         | Implement                                                  |
| Weekend/next-seven presets | Derivable                           | No                         | Implement in one LA-time normalizer                        |
| Soonest sort               | Yes                                 | No                         | Implement deterministic cursor order                       |
| City/region                | Yes                                 | No                         | Implement initially through approved normalized localities |
| Postal code                | Stored privately                    | No                         | Gate on privacy and product approval                       |
| Radius/bounds              | Coordinates/PostGIS exist privately | No                         | Gate on privacy, abuse, query-plan, and marker approval    |
| Distance sort/display      | Derivable from private data         | No                         | Defer until safe projection is approved                    |
| Title/description keyword  | Text exists                         | No FTS contract/index      | Future prerequisite; do not ship a misleading input        |
| Neighborhood               | No normalized field                 | No                         | Unsupported                                                |
| Item categories/tags       | No                                  | No                         | Unsupported                                                |
| Item price                 | No                                  | No                         | Unsupported                                                |
| Featured                   | No                                  | No                         | Unsupported                                                |

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

### Marker rules

| Runtime location state | Public text                                         | Marker behavior                                                                         |
| ---------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Exact                  | Current allowed address projection                  | Exact point may be used only after marker-contract/privacy approval                     |
| Approximate            | City, region, country, and approved "Near..." label | Use an approved locality/coarse point not derived by lightly rounding the private point |
| Hidden before start    | City/region and release explanation                 | Use the same approved locality/coarse approach or an intentional regional cluster       |
| Hidden after start     | Runtime exact projection                            | Exact point may release only from authoritative server time and approved cache behavior |
| Expired/archive        | City/region only                                    | Never retain a residential exact marker                                                 |

The coarse-marker algorithm must be documented and security reviewed. If no
safe coarse source is approved, omit precise marker geometry and show a
regional aggregate rather than leak location.

### Anti-triangulation requirements

- Repeated bounds/radius queries can reveal a private point through result
  inclusion changes even when coordinates are absent.
- Security approval must cover minimum radius/bounds, coordinate coarsening,
  inclusion behavior, rate limits, log redaction, caching, and abuse
  monitoring.
- Distance labels for approximate/hidden listings are absent unless computed
  from an approved coarse point and explicitly understood as approximate.
- Browser geolocation is opt-in, purpose-limited, and not persisted or logged
  as a raw coordinate by default.

### Mapbox boundary

- Current Mapbox integration is server-only forward geocoding. Never expose the
  existing server token to the browser.
- A client renderer/package, public restricted token, allowed origins,
  environment validation, CSP changes, quotas/billing limits, and Preview
  configuration require separate approval.
- Map failure must not block the list or detail route.

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
- Preserve server Mapbox validation, confidence/error handling, and
  schedule/location timezone agreement.
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
- Dynamically import Mapbox only for map view; list view must make no Mapbox
  script, stylesheet, token, or tile request.
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

### Beta and preview indexing safety

- Phase 1 must add a testable application-level robots policy for all Preview
  deployments and the Production beta.
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
- Do not compare live Mapbox tiles pixel-for-pixel. Use a deterministic map
  adapter/surface for component screenshots and test live map controls and
  markers semantically in Preview.
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
- List view does not load Mapbox resources.

## 20. Preview deployment and review workflow

This is a future review workflow, not authorization to deploy this planning
branch.

1. Complete local and CI gates for the current implementation phase.
2. Confirm the branch is not the Vercel Production branch.
3. Create only a non-Production Preview after owner approval.
4. Confirm `APP_ENV=preview` and isolated Preview Neon, Blob, Resend, Mapbox,
   and Stripe test resources with matching resource markers without printing
   secrets.
5. Apply only checked-in migrations to Preview Neon when a separately approved
   phase contains one. Never use `db push`.
6. Verify Preview and beta robots/noindex behavior before visual review.
7. Review at 360, 390, 430, 768, 1280, and 1440 where relevant.
8. Review touch, keyboard, NVDA sample, 200% text zoom, mobile landscape,
   reduced motion/transparency, slow network, empty/error/conflict states, and
   safe-area spacing.
9. Run the real Preview workflow appropriate to the phase with controlled
   accounts and provider-safe data.
10. Record sanitized screenshots, test results, unresolved issues, and the
    owner decision.

Unavailable Preview providers are `BLOCKED`, not passing. Never use
`--prod`, assign the public domain, promote a deployment, or configure
Production as part of a phase review.

## 21. Phased implementation roadmap

| Phase                                                    | Outcome                                                                                | Principal dependency                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1. Design foundation and application shells              | Tokens, base primitives, indexing safety, and public/auth/dashboard/builder shells     | Approved DESIGN and no new UI dependency                          |
| 2. Authentication                                        | Cohesive mobile-first auth/recovery/session presentation                               | Existing auth contracts remain unchanged                          |
| 3. Homepage and marketing pages                          | Public story, category/marketing content, and a functional default/sale `/search` list | Approved copy/legal/service content and G3 list slice             |
| 4. Shared search and map                                 | Extend the same list contract with dates, location, cursors, and a lazy map            | Remaining G3, privacy markers, Mapbox browser/config, query plans |
| 5. Public listing details                                | Photo-forward, privacy-safe, canonical active/expired detail                           | Existing snapshot plus approved expired projection                |
| 6. Organizer dashboard                                   | Workflow-led overview/listings/profile/account                                         | Batch summary DTO; no analytics                                   |
| 7. Listing builder                                       | Five focused, recoverable mobile steps                                                 | Existing event/photo/payment contracts                            |
| 8. SEO, accessibility, performance, and final regression | Launch-ready verification while retaining beta noindex until approval                  | Content/inventory/SEO launch gate                                 |

No phase begins automatically. Each stops for evidence and approval.

## 22. Acceptance criteria for every phase

### Phase 1: Design foundation and application shells

**Routes and files affected**

- `src/app/layout.tsx`, `src/app/globals.css`, global error/loading/not-found
  surfaces as approved.
- New shared primitives and shell files under `src/components/`.
- `src/app/dashboard/layout.tsx` and focused shell boundaries as needed.
- Robots-policy helper/tests to keep Preview and Production beta noindex.

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

**Preview review**

- Optional only after local/CI pass and explicit approval; verify noindex
  before reviewing.

**Stop condition**

- Stop after token/shell/noindex evidence and owner approval. Do not start auth.

### Phase 2: Authentication

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

**Preview review**

- Controlled recipient only; repeat registration, verification, reset, prior
  session revocation, and safe failures.

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

**Preview review**

- Review every claim, legal page, empty inventory state, and service CTA with
  the owner.

**Stop condition**

- If G2 or the Phase 3 slice of G3 is unapproved, stop before the affected
  route/inventory work. Otherwise stop when copy, routes, functional links,
  screenshots, and noindex state are approved. Do not start the
  date/location/cursor/map extension.

### Phase 4: Shared search and map

**Routes and files affected**

- Extend the Phase 3 `/search` page/loading/error surfaces.
- Extend the Phase 3 public-search application/repository boundary.
- Add the exact `GET /api/search` adapter described in Section 10.
- Search/list/filter/date/map components.
- `next.config.ts` and environment parsing only if separately approved for the
  browser map.

**Components**

- ListingCard/List/Grid, view toggle, filter/date sheets, chips, cursor
  controls, map loader/map/controls/markers/clusters/preview.

**Backend/data dependencies**

- Approved normalized query/response/cursor contract.
- Published-only repository query and representative query plans.
- Privacy-approved exact/coarse marker algorithm and anti-triangulation rules.
- Approved browser map library, restricted token, origins, CSP, quotas, and
  Preview configuration.
- Any schema/index change is a separate prerequisite, not implicit.

**Tests required**

- URL/date/cursor unit tests; published-only integration tests; shared
  list/marker contract; privacy non-leakage; list/map/back/filter E2E; SSR HTML;
  map failure; no-results; response-schema/version and page-cap tests; proof
  list responses contain no geometry and list view loads no Mapbox.

**Mobile acceptance**

- Full list and map flows work at 360/390/430 with 48px controls, filter/date
  sheets, one-thumb toggle, safe-area clearance, and accessible marker preview.

**Tablet/desktop acceptance**

- Tablet remains usable without cramped split; desktop map split synchronizes
  selection and criteria without hover dependency.

**Accessibility**

- Results summary/live changes are controlled; map has a list alternative;
  keyboard can select controls/markers and escape previews; focus returns.

**Preview review**

- Use isolated Preview Mapbox and deterministic fixtures; inspect token/network
  exposure, safe markers, bounds behavior, query timing, and screenshots.

**Stop condition**

- If any search-contract, privacy, dependency, provider, CSP, or query-plan gate
  is unapproved, stop before map implementation. Otherwise stop after the
  shared search review; do not begin detail redesign.

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

**Preview review**

- Review controlled listings in every privacy state and a simulated expired
  state without exposing private addresses.

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

**Preview review**

- Review controlled accounts across restricted, unverified, incomplete,
  draft, payment, blocked, and published states.

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
- No autosave, provider, schema, payment, or publication rule change is
  assumed.

**Tests required**

- Current wizard/photo/payment unit and integration suites and broad E2E.
- Mobile step layouts, sticky clearance, conflict/error focus, upload
  retry/processing, keyboard ordering, cover gating, approved-edit
  invalidation, offline/timeout recovery, and all payment states.

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

**Preview review**

- Repeat the complete current Preview workflow with controlled Mapbox, Blob,
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
  performance budgets; provider-safe Preview regression.

**Mobile acceptance**

- All launch routes pass 360/390/430 content, interaction, visual, zoom,
  landscape, and CWV review.

**Tablet/desktop acceptance**

- All launch routes pass 768/1280/1440 composition, keyboard, visual, and
  performance review.

**Accessibility**

- WCAG 2.2 AA checklist is complete with documented manual evidence and no
  unresolved critical/serious issue.

**Preview review**

- Run the complete non-Production workflow and retain sanitized evidence.
- Confirm beta/Preview noindex before and after all tests.

**Stop condition**

- Stop with Production beta still noindex. Enabling indexing, merging to main,
  or Production deployment requires separate explicit approval.

## 23. Risks, prerequisites, and approval gates

### Approval gates

| Gate                        | Required decision                                                                                                           | Blocks                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| G1: Indexing safety         | Approve server-side beta/Preview robots policy and tests                                                                    | Any public visual rollout                         |
| G2: Content/legal           | Approve marketing claims, legal pages, FAQ, contact details, and service CTA                                                | Phase 3 acceptance                                |
| G3: Public search contract  | Approve the Phase 3 published-list/card slice, then query, transport, DTOs, cursor, filters, abuse boundary, and versioning | Phase 3 inventory/search links and Phase 4        |
| G4: Marker privacy/security | Approve coarse-point method, exact release, anti-triangulation, distance, geolocation, caching, logging, and rate limits    | Map and spatial filters                           |
| G5: Map dependency/provider | Approve browser renderer/package, restricted token, origins, CSP, quota/billing, and Preview config                         | Interactive map                                   |
| G6: Database/query plan     | Approve representative query plans and any schema/index migration                                                           | Search launch if current indexes are insufficient |
| G7: Dashboard summary       | Approve the batch organizer-listing/payment summary DTO and bounded repository strategy                                     | Phase 6                                           |
| G8: Expired projection      | Approve archive fields, address removal, media placeholder/retention, cache behavior, and EventCompleted metadata           | Phase 5/8                                         |
| G9: Optional tooling        | Approve axe, Lighthouse CI, bundle analyzer, RUM, or other new dependency/provider                                          | Only the related automated check                  |
| G10: Preview                | Approve non-Production deployment and isolated resources                                                                    | Hosted phase review                               |
| G11: Public launch/indexing | Approve inventory, content, privacy, SEO, accessibility, performance, robots, sitemap, and live-mode posture                | Removing noindex, merge/promotion/deploy          |

### Primary risks and mitigations

| Risk                                                               | Consequence                         | Mitigation                                                                                        |
| ------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| Private location leaks through markers, distance, counts, or cache | Residential privacy harm            | Application-owned DTO, coarse-marker review, anti-triangulation tests, server time, log redaction |
| Separate list/map logic drifts                                     | Conflicting inventory and filters   | One normalizer, service, cursor, projection, and contract                                         |
| Raw publication snapshot is serialized                             | Hidden exact address exposure       | Parse and project server-side; contract tests reject private keys                                 |
| Production beta is indexed early                                   | Thin/incomplete pages enter search  | Implement G1 first; launch change remains separate                                                |
| Map bundle harms mobile list performance                           | Poor 90% mobile experience          | Lazy import; assert no Mapbox network in list view                                                |
| Dashboard redesign invents product data                            | Misleading organizer experience     | Real next-action/status DTOs only                                                                 |
| Monolithic refactor changes business behavior                      | Auth/payment/publication regression | Incremental presentation extraction and existing integration/E2E suites                           |
| Expired page retains street address                                | Long-lived residential disclosure   | City/region archive projection and exact-marker removal                                           |
| Search queries do not scale                                        | Slow SSR and map refresh            | Representative query plans, bounded page size, cursor, gated indexes                              |
| Visual snapshots become flaky                                      | Low-trust regression signal         | Deterministic fixtures, masked dynamic data, deterministic map surface                            |
| New dependency expands security/maintenance surface                | Unreviewed risk                     | Dependency approval and no-library default                                                        |
| Thin location pages become doorway pages                           | SEO quality penalty and poor trust  | Inventory/content threshold and owner review                                                      |

### Recommended first implementation task

Begin with a narrowly scoped Phase 1 safety/foundation slice:

1. Add an application-level, server-only Preview and Production-beta noindex
   policy with focused tests. Keep it fail-closed even if the beta flag is
   absent.
2. Implement the approved root color, typography, spacing, focus, motion, and
   safe-area tokens without changing route behavior.
3. Add the skip-link and minimal shell landmarks.
4. Run existing verification and capture 360/390/430/768/1280 baseline
   screenshots.
5. Stop for review before redesigning authentication or any product page.

This sequence removes the immediate indexing risk and establishes the smallest
shared foundation for every later phase while leaving all backend workflows
untouched.
