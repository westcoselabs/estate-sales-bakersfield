---
version: alpha
name: Estate Sales Bakersfield Local Modern Marketplace
description: A light-first, mobile-first design system for a trustworthy, photo-forward estate and yard sale marketplace.
colors:
  primary: "#173A2D"
  primary-hover: "#10291F"
  on-primary: "#FFFFFF"
  accent: "#B97917"
  accent-hover: "#9B5F0E"
  on-accent: "#17201B"
  on-accent-hover: "#FFFFFF"
  background: "#F7F8F6"
  surface: "#FFFFFF"
  surface-muted: "#EEF1ED"
  surface-glass: "rgba(255, 255, 255, 0.86)"
  text-primary: "#17201B"
  text-secondary: "#526058"
  border-subtle: "#D9DED9"
  border-strong: "#8A978E"
  focus: "#B97917"
  success: "#1F6B45"
  success-surface: "#E6F3EB"
  warning: "#8A5A00"
  warning-surface: "#FFF4D6"
  error: "#A12C2C"
  error-surface: "#FBEAEA"
  info: "#1F5C78"
  info-surface: "#E9F2F6"
  overlay: "rgba(23, 32, 27, 0.56)"
typography:
  display:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: 56px
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.025em
  headline-md:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.02em
  title-lg:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.01em
  title-md:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: 20px
    fontWeight: 650
    lineHeight: 1.3
  body-lg:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: 14px
    fontWeight: 650
    lineHeight: 1.25
  caption:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
rounded:
  none: 0px
  sm: 6px
  md: 12px
  lg: 16px
  xl: 20px
  sheet: 24px
  full: 9999px
spacing:
  none: 0px
  xs: 4px
  sm: 8px
  md: 12px
  base: 16px
  lg: 24px
  xl: 32px
  2xl: 40px
  3xl: 48px
  4xl: 64px
  5xl: 96px
  touch: 48px
  gutter-mobile: 16px
  gutter-tablet: 24px
  gutter-desktop: 32px
components:
  page:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-md}"
  surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "{spacing.base}"
  surface-muted:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "{spacing.base}"
  surface-glass:
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xl}"
    padding: "{spacing.md}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    height: "{spacing.touch}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    height: "{spacing.touch}"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    height: "{spacing.touch}"
  button-accent-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.on-accent-hover}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    height: "{spacing.touch}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    height: "{spacing.touch}"
  button-danger:
    backgroundColor: "{colors.error}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    height: "{spacing.touch}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    height: "{spacing.touch}"
  input-error:
    backgroundColor: "{colors.error-surface}"
    textColor: "{colors.error}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    height: "{spacing.touch}"
  filter-chip:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
    height: "{spacing.touch}"
  filter-chip-selected:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
    height: "{spacing.touch}"
  listing-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  bottom-sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sheet}"
    padding: "{spacing.base}"
  map-control:
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
    height: "{spacing.touch}"
  divider:
    backgroundColor: "{colors.border-subtle}"
    width: 1px
  control-outline:
    backgroundColor: "{colors.border-strong}"
    size: 1px
  focus-indicator:
    backgroundColor: "{colors.focus}"
    size: 3px
  overlay:
    backgroundColor: "{colors.overlay}"
  status-success:
    backgroundColor: "{colors.success-surface}"
    textColor: "{colors.success}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  status-warning:
    backgroundColor: "{colors.warning-surface}"
    textColor: "{colors.warning}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  status-error:
    backgroundColor: "{colors.error-surface}"
    textColor: "{colors.error}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  status-info:
    backgroundColor: "{colors.info-surface}"
    textColor: "{colors.info}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "{spacing.sm}"
  listing-title:
    textColor: "{colors.text-primary}"
    typography: "{typography.title-md}"
  section-title:
    textColor: "{colors.text-primary}"
    typography: "{typography.title-lg}"
  supporting-copy:
    textColor: "{colors.text-secondary}"
    typography: "{typography.body-sm}"
  marketing-copy:
    textColor: "{colors.text-primary}"
    typography: "{typography.body-lg}"
  mobile-heading:
    textColor: "{colors.text-primary}"
    typography: "{typography.headline-md}"
  desktop-heading:
    textColor: "{colors.text-primary}"
    typography: "{typography.headline-lg}"
  marketing-display:
    textColor: "{colors.text-primary}"
    typography: "{typography.display}"
---

# Estate Sales Bakersfield Design System

## Overview

Estate Sales Bakersfield is a local marketplace for shoppers finding nearby
estate and yard sales and for organizers creating paid public listings. The
interface should feel trustworthy, useful, warm, and unmistakably local. It
should showcase real sale photography without borrowing the visual language of
an antiques shop, luxury real estate brochure, or generic SaaS dashboard.

This document is the normative visual and interaction source of truth for the
future overhaul. The YAML tokens are implementation values. The prose explains
how to apply them without changing existing business rules.

### Source material

The system synthesizes four sources:

1. The current Next.js application and its real authentication, organizer,
   listing-builder, media, approval, payment, and publication workflows.
2. The three conceptual mockups in `docs/mock-ups/`, which establish a
   photo-forward direction, warm neutral surfaces, forest and gold brand cues,
   rounded controls, and map/list composition.
3. The mandatory `/ui-ux-pro-max` design-system and UX recommendations.
4. The Google DESIGN.md structure and token conventions.

The mockups are creative direction, not a feature specification. Favorites,
saved searches, item categories, item prices, analytics, recommendations,
notifications, auctions, flea markets, and messaging must not appear as active
features until supported by real data and approved contracts.

### Product truths

- The current sale types are estate sale and yard sale.
- Users can sign up, log in, verify email, reset passwords, review active
  sessions, and revoke sessions.
- Email verification gates photo uploads, approval, payment, and publication.
- Organizer onboarding is complete only when display name, contact name, and
  contact email are complete. Phone and website remain optional.
- Listing creation has five stages: Details, Schedule, Address and privacy,
  Photos, and Review, approval and payment.
- Address privacy supports exact address, approximate location, and hidden
  until start. The interface must explain the consequence before selection.
- Photo states are server-authoritative. A photo is usable only when it reaches
  `READY`, and a `READY` cover photo is required.
- Editing approved content invalidates approval. The UI must warn before the
  edit and never imply the old approval still applies.
- Payment redirects do not publish a listing. Authoritative payment processing
  and publication state determine the outcome.
- Published listing routes are stable, canonical, and based on an immutable
  approved snapshot.

### Design principles

1. **Mobile is the primary canvas.** Design for 360–430px screens first,
   including text scaling, landscape, safe areas, and one-thumb reach.
2. **The next action is obvious.** Each view has one primary action. Secondary
   actions remain available without competing for attention.
3. **Photography carries personality.** UI chrome stays quiet so real sale
   imagery, titles, dates, and locations are easy to scan.
4. **Trust comes from clarity.** Verification, privacy, approval, payment, and
   publication states use plain language and explicit recovery actions.
5. **Warm does not mean decorative.** Forest, gold, off-white, considered
   spacing, and restrained depth create character without visual clutter.
6. **Progress is never implied.** Loading, uploading, processing, saving,
   payment, and publication states must reflect server-confirmed truth.
7. **Accessibility is part of the style.** Contrast, visible focus, readable
   type, generous targets, semantic controls, and motion preferences are
   non-negotiable.

### `/ui-ux-pro-max` decisions

Applied recommendations:

- Mobile-first layout and progressive enhancement.
- At least 48×48px interactive targets with at least 8px separation.
- Minimum 16px default mobile body and input text.
- WCAG AA color contrast and visible 3px focus indicators.
- Explicit labels, nearby errors, helper text, and recovery guidance.
- One primary action per screen.
- Bottom sheets for compact mobile filters and secondary tasks.
- Predictable back behavior and preservation of filter, form, and scroll state.
- Semantic color tokens, consistent radii, consistent elevation, and one icon
  language.
- Reserved image dimensions, responsive media, and skeletons for longer loads.
- Motion that communicates state, uses opacity or transform, and respects
  reduced motion.

Intentionally rejected recommendations:

- The generated orange/blue SaaS palette conflicts with the approved forest,
  gold, and warm-neutral identity.
- Cinzel and Josefin Sans create a decorative real-estate tone and reduce
  scanability for dates, locations, forms, and workflow states.
- Indigo/violet gradients do not express the local estate-sale brand and add
  decoration without meaning.
- Pervasive glassmorphism reduces contrast and increases rendering cost in
  dense forms and dashboard views.
- Swipe-only card actions and drag-only ordering exclude keyboard and
  assistive-technology users.
- Dark-first styling is outside this approved light-first phase. Token names
  remain semantic so a later dark theme can be designed and tested separately.
- High-energy community counters, social proof, and unsupported marketplace
  features would fabricate product capability or business evidence.

## Colors

The palette uses deep forest for trust and navigation, warm gold for selective
emphasis, off-white for the page canvas, and white for primary content
surfaces. Gold is not the default body-link color; forest provides stronger
text contrast.

### Core palette

| Role           | Token            | Value     | Use                                                                |
| -------------- | ---------------- | --------- | ------------------------------------------------------------------ |
| Primary        | `primary`        | `#173A2D` | Primary actions, selected filters, active navigation, map clusters |
| Primary hover  | `primary-hover`  | `#10291F` | Hover and active treatment for primary controls                    |
| Accent         | `accent`         | `#B97917` | Seller CTA, focus ring, featured emphasis, selected date accent    |
| Accent hover   | `accent-hover`   | `#9B5F0E` | Hover and active accent background                                 |
| Background     | `background`     | `#F7F8F6` | Global page canvas                                                 |
| Surface        | `surface`        | `#FFFFFF` | Cards, forms, dashboard panels, dialogs                            |
| Muted surface  | `surface-muted`  | `#EEF1ED` | Grouped controls, skeleton base, secondary sections                |
| Primary text   | `text-primary`   | `#17201B` | Headings, body, key metadata                                       |
| Secondary text | `text-secondary` | `#526058` | Supporting copy and metadata                                       |
| Subtle border  | `border-subtle`  | `#D9DED9` | Dividers and non-interactive card edges                            |
| Strong border  | `border-strong`  | `#8A978E` | Input boundaries and selected structural outlines                  |

### Semantic colors

| Meaning     | Foreground | Surface   | Required companion                           |
| ----------- | ---------- | --------- | -------------------------------------------- |
| Success     | `#1F6B45`  | `#E6F3EB` | Success icon and plain-language confirmation |
| Warning     | `#8A5A00`  | `#FFF4D6` | Warning icon and consequence or next step    |
| Error       | `#A12C2C`  | `#FBEAEA` | Error icon, cause, and recovery action       |
| Information | `#1F5C78`  | `#E9F2F6` | Information icon and descriptive label       |

Never use semantic color as the only indication. Pair every state with text and,
where useful, a consistent icon.

### Contrast and state rules

- Forest on white is `12.50:1`; white on forest is approved for all text sizes.
- Dark text on the approved gold is `4.62:1`; gold buttons therefore use
  `on-accent`, not white.
- The darker gold hover uses white text at `5.20:1`. The text-color change must
  transition with the background and remain legible at every frame.
- Primary text on the off-white background is `15.66:1`.
- Secondary text on white is `6.62:1`.
- Success, warning, error, and information foreground/surface pairs all exceed
  `5.4:1`.
- `border-strong` on white exceeds `3:1` and may define interactive boundaries.
  `border-subtle` is decorative only and cannot be the sole control boundary.
- The 3px gold focus indicator exceeds the `3:1` non-text contrast requirement
  on white and off-white. Add a 1px white separation when it overlaps forest or
  photography.
- Text placed over a photo requires a tested solid scrim or opaque text panel.
  Do not assume blur provides contrast.

### Glass and overlays

`surface-glass` is reserved for sticky public navigation, search controls over a
hero image, map controls, and bottom-sheet headers. Use at least 86% white,
`border-subtle`, and no more than 16px backdrop blur. Provide an opaque white
fallback and use opaque surfaces when reduced transparency is requested.

The overlay token is a 56% dark scrim. It must visually isolate a modal or sheet
without hiding the user’s spatial context.

### Theme policy

The first implementation is light-only. Do not generate a dark theme by
inverting these values. A future theme must map the same semantic roles to
separately tested colors and interaction states.

## Typography

Manrope is the future preferred family because it is contemporary, friendly,
and highly legible in both editorial headings and dense utility text. Load it
through `next/font` with display swap or optional behavior in a future
implementation. Until then, Arial and system sans-serif are acceptable
fallbacks. Do not add the font or change application code in this phase.

### Type roles

| Role            | Size    | Weight | Line height | Use                                |
| --------------- | ------- | ------ | ----------- | ---------------------------------- |
| Display         | 48–56px | 700    | 1.08        | Desktop marketing hero only        |
| Headline large  | 40px    | 700    | 1.15        | Desktop page H1                    |
| Headline medium | 32px    | 700    | 1.2         | Mobile page H1 and major sections  |
| Title large     | 24px    | 700    | 1.25        | Card groups and dashboard sections |
| Title medium    | 20px    | 650    | 1.3         | Listing titles and form steps      |
| Body large      | 18px    | 400    | 1.6         | Introductory marketing copy        |
| Body medium     | 16px    | 400    | 1.55        | Default body, controls, and inputs |
| Body small      | 14px    | 400    | 1.5         | Card metadata and helper text      |
| Label           | 14px    | 650    | 1.25        | Buttons, field labels, tabs        |
| Caption         | 13px    | 500    | 1.4         | Badges and compact metadata        |

On 360–430px screens, page H1 text uses a fluid 34–40px size rather than the
56px display token. The display role begins only when the composition has room
to preserve a readable measure and does not push the main action below the fold.

### Typography rules

- Default to sentence case. All-caps text is limited to short eyebrows and may
  not carry essential information.
- Use no more than weights 400, 500, 650, and 700 across the system. If the
  loaded font does not expose 650, map it to 600.
- Body text uses 35–60 characters per line on mobile and 60–75 on desktop.
- Dates, times, distances, payment amounts, versions, and status counters use
  tabular figures.
- Wrap important text rather than truncating it. If truncation is necessary,
  expose the full value through an accessible expansion or details view.
- Never set mobile form inputs below 16px.
- Respect browser zoom and text scaling up to at least 200% without clipping,
  overlap, or loss of action labels.

## Layout

### Mobile baseline

The primary design range is 360–430px. Begin with one content column, a 16px
gutter, vertical page scrolling, and full-width controls where the action
benefits from thumb reach. No essential content may require horizontal scroll.

Use `min-height: 100dvh` rather than fixed viewport height. Sticky headers,
bottom navigation, and action bars must include safe-area insets and reserve
matching content padding so the final content is never obscured.

### Breakpoints

| Minimum width | Intent                                                            |
| ------------- | ----------------------------------------------------------------- |
| 0px           | Small mobile baseline, one column                                 |
| 480px         | Large mobile, slightly wider card media and form grouping         |
| 768px         | Tablet, optional two-column supporting layouts                    |
| 1024px        | Desktop application shell, sidebar or synchronized list/map split |
| 1280px        | Wide desktop content grid                                         |
| 1440px        | Maximum-density marketplace composition without stretching text   |

Breakpoints respond to content pressure, not device names. Components may adapt
earlier when labels wrap or touch targets become cramped.

### Gutters, grids, and measures

- Mobile gutter: 16px.
- Tablet gutter: 24px.
- Desktop gutter: 32px.
- Marketing and application shells cap at approximately 1280px.
- Long-form content caps at 720px.
- Cards use 16px mobile padding and 20–24px on larger screens.
- Section rhythm uses 32px on mobile and 48–64px on larger screens.
- Related controls use 8–12px gaps; unrelated groups use at least 24px.

Cards may form a responsive grid, but source order must remain the logical
reading and keyboard order. Do not use masonry for listing results because it
weakens scanning and predictable navigation.

### Responsive behavior

- Listing cards are stacked and image-led on small mobile. At larger mobile
  widths they may use a compact side-by-side variant only when title, date, and
  location retain adequate space.
- Forms remain a single column through mobile. Closely related short fields may
  become two columns at tablet widths.
- Dashboard secondary navigation becomes a labeled sidebar at 1024px. Do not
  show a sidebar and bottom navigation at the same hierarchy simultaneously.
- Results use a list/map toggle on mobile. A synchronized split view is
  permitted at desktop widths.
- Mobile filters and custom dates use a bottom sheet. Desktop may use an inline
  filter bar plus a supplemental panel, but both use the same controls and state.
- Multi-step builder progress is compact on mobile: “Step 2 of 5,” current step
  name, and a progress indicator. Avoid rendering five full-width stacked step
  buttons.

### Layering

Use a predictable z-index scale:

- `0`: page content.
- `10`: sticky in-flow controls and card affordances.
- `20`: sticky header and bottom navigation.
- `40`: map controls and listing preview.
- `100`: sheet, dialog, or popover.
- `1000`: critical system notice only.

Do not solve local layout issues with arbitrary z-index values.

### Performance-aware layout

Reserve aspect ratios for every image, map, skeleton, and asynchronous panel.
The listing card uses a 4:3 image by default; hero and cover areas may use 16:9.
Only one above-the-fold image should receive high loading priority. Maps and
non-critical galleries are deferred until needed.

## Elevation & Depth

Depth is primarily tonal: off-white page, white content surface, and muted
grouped surface. Borders establish structure before shadows.

Use at most three elevation levels:

1. **Level 1:** `0 1px 2px rgba(23, 32, 27, 0.06)` for interactive cards and
   controls that need separation.
2. **Level 2:** `0 8px 24px rgba(23, 32, 27, 0.10)` for sticky search controls,
   selected map previews, and floating panels.
3. **Level 3:** `0 20px 48px rgba(23, 32, 27, 0.16)` for dialogs and bottom
   sheets over a scrim.

Do not use pure black shadows, multiple colored glows, or a shadow on every
card. Hover elevation may move between adjacent levels but may not change
layout dimensions.

Blur is functional, not decorative. It can reinforce separation behind a
sticky overlay or modal but cannot replace a scrim, boundary, or contrast-safe
surface.

## Shapes

The shape language is soft and practical:

- 6px for small media, progress tracks, and compact internal elements.
- 12px for buttons, inputs, map controls, and utility panels.
- 16px for listing cards, dashboard cards, and form sections.
- 20px for prominent marketing cards.
- 24px top corners for mobile bottom sheets.
- Full rounding for badges, filter chips, marker clusters, and avatars.

Do not combine sharp cards with highly rounded controls in the same hierarchy.
Photographs follow the containing card radius and are clipped cleanly.

### Icons

Use one rounded outline vector language with 1.75–2px strokes. Standard visual
sizes are 16px, 20px, and 24px inside at least 48×48px targets. Filled icons are
reserved for selected navigation or status emphasis and must not be mixed with
outline icons at the same level.

Do not use emoji as navigation, status, or action icons. `/ui-ux-pro-max`
recommends Phosphor as the first future library candidate and Heroicons as a
fallback, but no icon dependency is approved by this document. A later
implementation must obtain dependency approval or use the existing asset
strategy.

## Components

### Buttons and links

Buttons have a minimum 48px height, at least 16px horizontal padding, a visible
pressed state within 100ms, and one line of direct action text.

- **Primary:** forest background, white text. One per screen or decision group.
- **Accent:** gold background with dark text. Use for “List your sale” and
  carefully selected seller conversion moments, not every action.
- **Secondary:** white surface, forest text, and a 1px forest boundary.
- **Tertiary:** text or icon-plus-text action with a 48px hit area.
- **Danger:** error background and white text, spatially separated from routine
  actions.

Disabled buttons use native disabled semantics, remain readable, and do not
respond to input. Loading buttons keep their width, disable duplicate
submission, show progress, and retain an accessible action label.

Links are forest and underlined in running text. Navigation links may use
weight, an indicator, and `aria-current` instead of an underline. External
links use plain language and an optional external-link icon; they do not force a
new tab.

### Inputs and form feedback

Every field has a persistent visible label. Placeholder text is an example, not
a label. Complex fields include helper text before interaction.

- Input minimum height is 48px with 16px mobile text.
- Use `border-strong` for the default boundary and a 3px focus indicator with
  3px offset.
- Required and optional status is stated in text.
- Validate on blur or submission, not on every keystroke.
- Place a concise field error directly below the field and connect it with
  `aria-describedby`.
- When multiple fields fail, add an error summary with links and move focus to
  the first invalid field.
- Read-only and disabled states must look and behave differently.
- Use semantic input types, `inputmode`, and autocomplete values for email,
  password, telephone, numeric, date, and URL fields so mobile users receive
  the appropriate keyboard.
- Password fields include a labeled show/hide control when implemented.

Long workflows may show saved-state feedback: Unsaved, Saving, Saved with time,
Not saved with Retry, or Conflict with Reload. Keep the explicit “Save and
continue” action. Do not claim data is saved before the server confirms it.

### Public navigation

On mobile, use a compact top bar for brand and contextual search plus no more
than five labeled top-level destinations. Fixed navigation respects safe areas
and never obscures the last result or action.

Desktop navigation may expose Explore, Map, How it works, About, Log in, and
List your sale. Current-location state uses text weight and an indicator, not
color alone.

Explore links to `/search`, whose default view is the results list. Map links to
`/search?view=map`. Map is a view within the shared `/search` experience, not a
separate route or results implementation.

`/search` is the single future results and interactive-map experience. Both
views use the same listing, filter, date, sorting, pagination, URL-state, and
search contracts. Category landing pages may reuse listing cards and link to
filtered `/search` states but must not introduce separate filter, pagination,
map, or sorting components.

### Dashboard navigation

Mobile dashboard navigation uses labeled top-level destinations only:
Overview, Listings, Create, Profile, and Account. The desktop equivalent is a
labeled sidebar. Listing-builder steps are not dashboard navigation and belong
inside the focused workflow shell.

Always surface the most important real next action: verify email, complete
organizer profile, finish a draft, select a cover, approve a revision, complete
payment, recover publication, or view the published listing. Do not fabricate
views, engagement, favorites, revenue, or recommendation metrics.

### Listing cards

Listing cards prioritize:

1. Cover photo.
2. Sale type.
3. Listing title.
4. Date and time.
5. Privacy-safe city and region label.
6. Distance only when a supported search contract and user location exist.

Use a 4:3 reserved image area, a two-line title limit only when the full title
is available on the detail page, and stable metadata rows with vector icons.
The complete card is not automatically one large link if it contains secondary
actions; avoid nested interactive elements.

Do not show favorites, item categories, prices, organizer analytics, or
unsupported sale types. A featured treatment may use a gold label only when the
business and data define a real featured state.

### Marketing cards and seller assistance

Marketing cards use one message, one relevant image or icon, and one action.
Avoid rows of interchangeable feature tiles that restate the same benefit.

The professional-service callout is secondary to self-service listing creation:

- Heading: “Need hands-on help with your estate sale?”
- Explain help with organizing, pricing, staging, and promotion.
- Link label: “Explore Simply Decorated estate-sale services.”
- Visually mark the destination as an external professional service.
- Do not imply that the service is included in listing payment or platform
  checkout.

### Search controls and filters

Search controls expose only data-backed options. Sale type, date, location, and
supported sorting are primary. Future distance or keyword controls remain
absent until their public query contracts exist.

Selected filters appear as removable chips with text labels. “Clear all” is
available when more than one non-default filter is active. Applying or removing
a filter updates the result count and map from the same normalized state.

Controls must be operable without dragging, hovering, or precise pointer input.
The browser Back action restores filters, selected list/map view, pagination,
and scroll position.

### Date presets and custom range

Present Today, This Weekend, and Next 7 Days as 48px selection chips above the
custom-date action.

- **Today:** current Bakersfield calendar day.
- **This Weekend:** resolve in `America/Los_Angeles`. Monday through Thursday
  means the upcoming Friday through Sunday. Friday means Friday through Sunday.
  Saturday means Saturday through Sunday. Sunday means Sunday only.
- **Next 7 Days:** today plus the following six calendar days.
- **Custom range:** same-day ranges are valid; end cannot precede start.

Use `America/Los_Angeles` for preset boundaries in the Bakersfield experience.
The custom calendar opens in a compact mobile bottom sheet with large day
targets, weekday headers, a visible selected range, previous/next month
buttons, Cancel, and Apply. Announce the selected range in text and do not rely
on the gold fill alone.

### Status badges

Badges are concise, sentence case, and paired with nearby explanatory text when
the state affects what a user can do.

| System state                  | User-facing label           | Tone                      |
| ----------------------------- | --------------------------- | ------------------------- |
| `DRAFT_INCOMPLETE`            | Draft incomplete            | Neutral                   |
| `READY_FOR_REVIEW`            | Ready for review            | Information               |
| `APPROVED`                    | Approved                    | Information               |
| `READY_FOR_PAYMENT`           | Ready for payment           | Accent action             |
| `CHECKOUT_CREATED`            | Checkout ready              | Information               |
| `PAYMENT_PENDING`             | Payment pending             | Information with progress |
| `PAYMENT_RECEIVED_PUBLISHING` | Publishing                  | Information with progress |
| `PUBLISHED`                   | Published                   | Success                   |
| `PAYMENT_CANCELED`            | Payment canceled            | Warning                   |
| `CHECKOUT_EXPIRED`            | Checkout expired            | Warning                   |
| `PAID_PUBLICATION_BLOCKED`    | Publication needs attention | Error                     |
| `FULFILLMENT_RETRYING`        | Publication retrying        | Warning with progress     |
| `MANUAL_REVIEW_REQUIRED`      | Manual review required      | Error                     |

Photo badges use Reserved, Uploaded, Processing, Ready, and Failed. Builder
workflow badges use Draft, Preview ready, and Approved for payment. Raw enum
text is not exposed directly to end users.

### Feedback, empty, loading, and system states

- **Empty:** state what is absent, why when known, and the most useful supported
  next action. Do not use a blank card or fabricated example record.
- **No results:** preserve active filters, summarize them, and offer Clear
  filters or Expand area. Do not imply there are no listings everywhere.
- **Loading under 300ms:** avoid unnecessary animation.
- **Loading over 300ms:** use a layout-matched skeleton with reserved geometry.
- **Upload/processing:** show per-photo progress, filename, state text, and
  retry or remove where supported.
- **Success:** confirm the completed action and what happens next.
- **Error:** identify the failed operation, preserve user input, and provide
  Retry, Edit, Reload, or Contact support as appropriate.
- **Conflict:** explain that the listing changed elsewhere and offer a safe
  reload path. Never overwrite silently.
- **Offline/timeout:** keep recoverable form values in memory, explain that the
  server did not confirm the change, and offer retry.

Persistent page-level notices remain in flow. Toasts are reserved for brief,
non-critical confirmations, use `aria-live="polite"`, do not steal focus, and
remain available long enough to read.

### Map controls and marker previews

Map controls use opaque or approved glass surfaces with 48px targets. Zoom,
geolocate, list/map toggle, and “search this area” controls need text labels or
accessible names. Do not disable browser or operating-system map gestures.

Markers and clusters use forest as the default, gold for the selected result,
and text or icon differences in addition to color. Selected markers open one
listing preview at a time.

Mobile map previews use a bottom card sheet with cover photo, title, date,
privacy-safe location, and View details. Desktop may use an anchored preview.
Exact coordinates must never be visually inferred for approximate or
hidden-until-start listings.

### Bottom sheets, dialogs, and menus

Bottom sheets are preferred for mobile filters, compact date selection, and
secondary map details. They use 24px top corners, a strong top boundary, safe
bottom padding, an explicit close control, and a visible title. A drag handle is
supplemental, never the only dismissal mechanism.

Trap focus in modal content, close with Escape, return focus to the trigger, and
prevent background interaction. Confirm dismissal when unsaved changes would
be lost. Long primary workflows navigate to a page instead of living in a
modal.

### Organizer dashboard

The dashboard uses opaque surfaces and workflow-oriented cards. The overview
starts with the highest-priority next action, followed by real listings and
account status. Each listing card shows sale type, title, schedule, photo/cover
readiness, approval readiness, payment/publication state, last update, and the
appropriate next action.

Mobile cards stack labels and values; desktop may align them into structured
rows. Do not reproduce analytics, profile views, favorites, recommendations,
messages, alerts, or upgrade panels from the mockups until those features have
real data and requirements.

### Listing builder

The builder retains five business-rule stages:

1. Details.
2. Schedule.
3. Address and privacy.
4. Photos.
5. Review, approval and payment.

Mobile displays the current step, “Step N of 5,” and progress without turning
the full timeline into a long vertical navigation list. Back remains available.
A sticky bottom action area holds the current primary action and reserves
safe-area space.

Use progressive disclosure, persistent helper text, and section-level feedback.
Keep explicit Save and continue controls even if future autosave is introduced.
Do not store exact addresses in local storage.

Before editing an approved revision, explain that the change invalidates
approval and payment eligibility and require confirmation. Review must show the
same privacy projection and content that will be approved.

### Photo workflow

The upload surface accepts the currently supported JPEG, PNG, WebP, HEIC, and
HEIF formats, with a 15MB per-file limit. It must reflect the existing maximum
photo contract without encouraging users to upload unnecessary duplicates.

Each queued item shows a reserved preview area, filename, progress, server
state, and recovery action. A photo is not “saved” or complete until the server
returns `READY`. Processing failures remain attached to their photo and can be
retried or removed.

Cover selection is explicit and cannot target a non-ready photo. Reordering
provides visible Move earlier/Move later controls and keyboard support in
addition to any future drag interaction. Destructive removal requires a clear
target and stable confirmation.

### Public listing

The public detail experience is photo-forward but prioritizes title, type, date,
privacy-safe location, description, organizer, and gallery in that order.
Breadcrumbs remain visible and canonical routes remain stable.

Exact, approximate, and hidden-until-start addresses receive distinct text and
icon treatments. Do not reveal an exact street, coordinate, or map pin before
the current privacy projection permits it.

Meaningful images use descriptive alt text based on visible content when that
information exists. Avoid generic “item 1” alternatives. Decorative images use
empty alt text.

### Accessibility requirements

- Meet WCAG AA: 4.5:1 normal text, 3:1 large text, and 3:1 interactive
  boundaries and focus indicators.
- Include a skip link and one logical H1 per page.
- Preserve sequential heading order and landmark structure.
- Keyboard order follows visual and reading order.
- Every icon-only action has an accessible name.
- Navigation exposes current state; expandable controls expose expanded state.
- Selection, success, warning, error, and progress never rely on color alone.
- Support keyboard alternatives for photo ordering, map selection, and sheet
  dismissal.
- Announce async changes with appropriate polite or assertive live regions
  without repeatedly interrupting the user.
- Move focus to the relevant heading after route changes and back to the trigger
  after dialogs close.
- Do not disable zoom. Support 200% text zoom and mobile landscape.
- Keep fixed controls clear of safe areas and underlying content.

### Motion and interaction

Use three duration tokens in future implementation:

- Fast: 120ms for press, hover, and focus feedback.
- Standard: 180ms for component state changes and small expansions.
- Deliberate: 240ms for sheet, dialog, and map-preview entry.

Entering content uses ease-out; exiting content is approximately 60–70% as long
and uses ease-in. Animate opacity and transform, not width, height, top, or left.
Animations are interruptible and never delay navigation or server actions.
Continuous animation is reserved for active loading or processing indicators,
not decorative icons or ambient page effects.

Under `prefers-reduced-motion: reduce`, remove translation, scaling, parallax,
stagger, smooth scrolling, and shimmer. Preserve immediate state feedback with
color, border, text, or a short opacity change. Under reduced transparency, use
opaque surfaces and remove backdrop blur.

## Do's and Don'ts

### Do

- Do begin every component decision at 360px and validate through 430px before
  tablet and desktop.
- Do use forest for primary actions and gold selectively for focus, seller
  conversion, and featured emphasis.
- Do use opaque surfaces for forms, dashboard cards, listing cards, and payment
  states.
- Do show one primary next action based on verified current data.
- Do use real sale photography with reserved dimensions and meaningful alt text.
- Do retain explicit labels, helper text, server-confirmed progress, and
  recovery actions.
- Do preserve address privacy, approval invalidation, payment authority, and
  canonical publication behavior.
- Do use the same listing, filter, date, pagination, and map components for the
  future shared `/search` experience.
- Do test touch, keyboard, screen reader, text zoom, mobile landscape, reduced
  motion, and reduced transparency.
- Do use the three mockups as a coherent direction rather than three separate
  page styles.

### Don't

- Don’t use white text on the approved gold background.
- Don’t use generic blue/purple gradients, decorative glows, or gratuitous
  glassmorphism.
- Don’t shrink desktop dashboards into a 360px viewport.
- Don’t use body text below 14px or form text below 16px on mobile.
- Don’t hide essential actions in hover, swipe, drag, or unlabeled icons.
- Don’t place text directly on busy photography without an opaque panel or
  tested scrim.
- Don’t claim a photo, form, payment, or publication succeeded before the
  server confirms it.
- Don’t expose exact address or coordinate data when privacy mode does not allow
  it.
- Don’t add favorites, saved searches, analytics, categories, item pricing,
  recommendations, alerts, auctions, flea markets, or messaging as if they
  already exist.
- Don’t mix icon families, arbitrary radii, random shadows, or unapproved UI
  libraries.
- Don’t create a dark theme by automatically inverting the light palette.
- Don’t change business rules or backend behavior to match a visual mockup.
