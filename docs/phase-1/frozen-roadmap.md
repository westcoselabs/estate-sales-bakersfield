Exit code: 0
Wall time: 1.2 seconds
Output:
> Repository note: this is the preserved base roadmap supplied for implementation. For Phase 1 only, the four targeted corrections in [execution-plan.md](./execution-plan.md) supersede affected provider-verification, Blob-scope, audit-noise, and Git-remote wording below.

# Frozen Estate & Yard Sale Directory Implementation Roadmap

**Status: Approved for Phase 1 implementation.**

This document supersedes the previous revisions. Unaffected product rules, modular-monolith architecture, payment guarantees, state machine, feature boundaries, privacy controls, testing strategy, and rollout priorities remain in force.

## 1. Final Revision Summary

### Changed architectural decisions

| Area | Frozen decision |
|---|---|
| Authentication | Custom opaque PostgreSQL sessions modeled on `txlocallist`; no authentication framework or architecture spike. |
| Verification | Unverified users may log in and create text-only drafts, but cannot upload media, approve, accept final terms, check out, or publish. |
| Email | Resend behind an `EmailService` interface; minimal reliable delivery using the existing outbox foundation. |
| Storage provider | Vercel Blob is selected for launch behind a provider-neutral `MediaStore` interface. No second adapter is built initially. |
| Media retention | Keep only sanitized display and thumbnail variants; delete uploaded originals after processing. |
| Media delivery | Stable `/media/[photoId]/[variant]` URLs; Phase 3 validates signed redirect versus private proxy without reopening the provider decision. |
| Event URLs | `/estate-sales/[slug]-[publicId]` and `/yard-sales/[slug]-[publicId]`; no mutable geography in canonical paths. |
| Address changes | Post-payment automatic edits are limited to normalization of the same verified physical address; substantive changes require review. |
| Address history | Financial proof and exact historical residential addresses have separate retention policies. |
| Imported inventory | Add explicit `OWNER_CREATED`, `ADMIN_IMPORTED`, and `PARTNER_FEED` origins with different ownership/payment invariants. |
| Roadmap | Phase 1 begins the custom auth foundation; Phase 4 remains the first complete paid-publication proof. |

### Preserved core architecture

- Greenfield Next.js App Router modular monolith.
- Strict TypeScript, Neon PostgreSQL, Prisma migrations, PostGIS.
- Feature modules with thin routes/actions and centralized domain policies.
- Narrow public DTOs and separate private location storage.
- Optimistic concurrency, transaction-safe media limits, durable audit.
- Stripe webhook-only publication, idempotency, reconciliation, and no refund workflow.
- Paid-field immutability and stable canonical URLs.
- PostgreSQL-backed search and privacy-safe list/map projections.
- Paid publication before search breadth, advanced operations, or visual polish.

The custom auth design adapts the useful patterns verified in [txlocallistâ€™s session implementation](C:/Users/citry/OneDrive/Desktop/txlocallist/src/lib/auth/session.js): random opaque tokens, token hashing, database sessions, secure cookie attributes, and centralized guards. Its missing verification, reset, rotation, revocation, limiting, and audit controls must be added.

## 2. Updated Architecture and Schema

### Custom authentication architecture

No Better Auth, Auth.js, NextAuth, social login, magic links, passkeys, SMS verification, auth SaaS, or alternate provider is in initial scope.

#### Passwords and account records

- Use Argon2id with per-password random salts and versioned parameters.
- Calibrate Phase 1 parameters on the selected Vercel runtime, targeting approximately 200â€“350 ms while meeting a minimum 64 MiB memory cost.
- Store the encoded Argon2id hash only.
- Minimum password length: 12; maximum: 128.
- Rehash on successful login when parameters become outdated.
- Normalize email before uniqueness checks; enforce case-insensitive uniqueness.
- Roles remain `USER` and `ADMIN`.
- User includes `emailVerifiedAt`, account restriction fields, and audit timestamps.

#### Sessions

- Generate at least 32 cryptographically random bytes and encode base64url.
- Store only `SHA-256(sessionToken)` in PostgreSQL.
- Set a host-only, HTTP-only, `Secure`, `SameSite=Lax`, path `/` cookie.
- Seven-day absolute session expiration.
- Every successful login creates a new session; no pre-authentication session is reused.
- Rotate sessions after email verification, password reset/change, email change, privilege change, and other sensitive authentication events.
- Password reset revokes all existing sessions.
- Current logout deletes the current session hash and expires the cookie.
- Users may list sessions, revoke one, or revoke all.
- Administrator restriction or role removal revokes all sessions.
- Expired sessions are rejected immediately and cleaned by an idempotent scheduled job.
- Store bounded device/user-agent information for session management; do not expose raw session hashes.

#### Verification and reset tokens

Use separate verification and reset records containing:

- User ID.
- Cryptographically random token hash only.
- Purpose.
- Expiration.
- Created and consumed timestamps.
- Attempt/resend metadata.

Rules:

- Verification token lifetime: 24 hours.
- Password-reset token lifetime: one hour.
- Tokens are single-use and consumed transactionally.
- Creating a new token invalidates older active tokens of the same purpose.
- Token verification uses constant-time comparison where applicable.
- Email-scanner-safe links open a confirmation page; state-changing token consumption occurs through POST, not link-prefetch GET.
- Signup, login, verification resend, forgot-password, and reset responses do not reveal whether an account exists.

#### Authorization

Provide central server-only functions:

- `getCurrentSession`
- `getCurrentUser`
- `requireUser`
- `requireAdmin`
- `requireVerifiedPublishingUser`
- `revokeSession`
- `revokeAllSessions`

`requireUser` allows an unverified account to use the permitted draft workflow. Upload, approval, terms, checkout, and publication commands call `requireVerifiedPublishingUser`.

Ownership checks remain inside application commands, even when route guards have already executed.

Audit:

- Signup and verification.
- Successful password reset/change.
- Login success and rate-limited/blocked attempts without storing passwords.
- Session creation, rotation, logout, individual revocation, and global revocation.
- Email change, restriction, role change, TOTP enrollment, and administrator action.
- Never log raw password, session, verification, or reset tokens.

Record this final decision in `docs/architecture/authentication.md` and `docs/adr/001-custom-opaque-sessions.md`.

### Verification behavior and email

An unverified user may:

- Browse public events.
- Create an account and log in.
- Create/edit an organizer profile.
- Create and edit a basic text-only event draft.
- Enter event, address, and schedule information.

A verified email is required before:

- Media reservation or upload authorization.
- Upload finalization or image processing.
- Approval.
- Final publishing-terms acceptance.
- Checkout Session creation.
- Payment fulfillment/publication.

Resend is the only initial email provider and is accessed through an `EmailService` interface. Required messages:

- Verification.
- Verification resend.
- Password reset.
- Publication/payment confirmation.
- Important enforcement notice.

Keep delivery simple:

- Verification/reset requests persist the token before calling Resend.
- A provider failure is logged safely and the user can retry through rate-limited resend/reset flows.
- Publication and enforcement messages use the existing minimal durable outbox so committed state is not lost when email fails.
- No redundant provider, campaign system, or standalone email queue is introduced.
- Track sends, provider message ID, status, attempts, and terminal failure without storing email body copies.
- Rate-limit resend requests to protect deliverability and free-tier usage.
- Imported events never create accounts or send verification emails.

### Vercel Blob provider boundary

Vercel Blob is the selected launch provider.

Do not use R2, Spaces, VPS/local disk, or Git storage for initial production media. Implement one adapter only.

Domain modules depend on a provider-neutral `MediaStore` interface supporting:

- Event-scoped upload authorization.
- Object/path verification.
- Private-object read.
- Temporary read access.
- Metadata/head retrieval.
- Object deletion.
- Bounded batch deletion/listing needed for cleanup and repair.

Vercel SDK types must remain inside `src/integrations/blob`. Event, media, payment, authorization, and cleanup modules exchange application-owned types such as `StoredObjectRef`, `UploadAuthorization`, and `TemporaryReadTarget`.

A future R2 adapter may implement the same interface without changing domain policies or database semantics, but it is not built at launch.

Record this in `docs/adr/002-vercel-blob-provider.md`.

### Final media lifecycle

Use one private Blob store per environment with separate staging and final prefixes.

1. Atomically reserve an event photo slot.
2. Verify authenticated, verified owner and event ownership.
3. Issue event/photo/path-scoped direct-upload authorization.
4. Upload to private staging.
5. Verify reservation, pathname, object identity, size, and metadata.
6. Decode and validate source bytes.
7. Correct orientation and normalize color.
8. Strip EXIF, GPS, XMP, and unnecessary metadata.
9. Produce sanitized display and thumbnail variants.
10. Verify the final variants exist and are readable.
11. Mark the photo `READY`.
12. Delete the original staging object.
13. Retain only sanitized variants until lifecycle cleanup.

Supported inputs remain JPEG, PNG, WebP, HEIC, and HEIF. HEIC/HEIF may be converted in the browser before upload, but the server still treats the result as untrusted and re-encodes it.

Default variants remain:

- Display WebP, maximum 2,400-pixel long edge.
- Thumbnail WebP, maximum 640 pixels.

Do not retain full-resolution originals after success. If tests demonstrate a concrete recovery need, any temporary recovery copy must have a short TTL and be approved through the media ADR; indefinite originals are prohibited.

The 150-photo atomic slot count, ownership, reservations, states, cover rules, ordering, digest checks, retries, and cursor gallery loading remain unchanged.

### Stable media URLs

All pages, cards, JSON-LD, metadata, emails, and Open Graph data use:

`/media/[photoId]/[variant]`

The route:

1. Loads a narrow photo/event visibility projection.
2. Validates variant.
3. Allows owner/admin draft access only after authorization.
4. Allows public access only when the eventâ€™s origin/lifecycle/publication rules permit it.
5. Rejects deleted, canceled, suspended, removed, unavailable, or unauthorized media.
6. Never exposes private draft media publicly.
7. Resolves only stored sanitized variant paths.
8. Uses safe content type, `nosniff`, and cache headers.

Phase 3 validates two Vercel Blob delivery implementations:

- **Default:** access check followed by redirect to a private, path-scoped signed GET URL valid for no more than 60 seconds.
- **Fallback:** access check followed by streaming the private object through the application.

Choose the simplest method that passes Next Image, gallery, Open Graph/social crawler, search crawler, browser cache, suspension/removal, performance, and Vercel cost tests.

This is a delivery-method validation, not an open storage-provider decision. Stable application URLs never embed signed URLs in canonical HTML or metadata. Suspension/removal blocks the application route immediately; previously issued signed URLs expire within their short validity window.

Record the validated delivery mode in `docs/adr/003-stable-media-delivery.md`.

### Mandatory photo replacement

Approval, checkout, fulfillment, payment repair, and active published media deletion require:

- At least one event-owned `READY` photo.
- An event-owned `READY` cover.

A one-photo published event replaces it in this order:

1. Reserve/upload replacement.
2. Process replacement to `READY`.
3. Set replacement as cover.
4. Delete original.

The event must never pass through an actively published state without a ready photo and cover. Ended-event cleanup, owner cancellation, and permanent removal are exempt.

### Canonical and editorial routes

Permanent owner-created and imported event routes are:

- `/estate-sales/[slug]-[publicId]`
- `/yard-sales/[slug]-[publicId]`

The path is generated once at first publication and never changes. It contains no city, state, ZIP, organizer, schedule, or other mutable field.

Bakersfield editorial pages:

- `/estate-sales`
- `/yard-sales`

Future approved location hubs may use:

- `/locations/ca/fresno/estate-sales`
- `/locations/ca/fresno/yard-sales`

No location pages are generated automatically.

Local context must remain prominent in:

- SEO title and H1.
- Meta description.
- Breadcrumb text.
- JSON-LD.
- Event details.
- Search/list/map cards.
- Organizer and event anchor text.

Search remains `/search` and always `noindex`.

### Final post-payment address policy

One centralized `PostPaymentLocationChangePolicy` applies to owner, admin, script, and job mutations.

#### Automatically permitted

Only corrections that continue to identify the same verified physical address:

- Capitalization or formatting.
- Postal normalization.
- `Street` versus `St`.
- Unit, apartment, or suite information.
- Geocoder precision improvement.
- Provider normalization resolving to the same address identity.

#### Administrator review

Create a pending `LocationChangeRequest` without changing the public event when any of these occurs:

- Primary street-number change.
- Street-name change.
- New provider address identity.
- Meaningful coordinate movement.
- ZIP, city, state, or timezone change.
- Claimed nearby venue move.
- Low-confidence or ambiguous geocoding.

Distance, ZIP, locality, provider identity, and precision support the review but never automatically authorize a primary-address change.

#### Reject/new event required

- The address represents another sale.
- State changes unless an exceptional review confirms provider normalization only.
- Movement exceeds the configured review area.
- Location is clearly unrelated.
- The request is combined with type, dates, organizer, owner, or payment-owner changes.

Administrators decide `SAME_EVENT_CORRECTION` or `DIFFERENT_EVENT`. Rejected requests require a new event and another payment. The original purchase is never transferred.

All requests, evidence, and decisions are audited. The canonical URL remains stable because it contains no geography.

### Payment versus exact-address retention

Separate immutable payment proof into:

1. **Long-term proof core**
2. **Time-limited sensitive address evidence**

Long-term payment history may retain:

- Event ID and origin.
- Purchaser and organizer references.
- Approved content digest.
- Event type and purchased dates.
- City/state.
- Terms version.
- Photo IDs/digests.
- Stripe references, amount, and currency.
- Publication, provider-incident, and enforcement history.

Sensitive address evidence may retain:

- Exact normalized address.
- Exact coordinates.
- Provider address ID.
- Geocoding precision and correction evidence.

It has its own `retainUntil` and legal-hold controls. When retention expires:

- Purge exact historical address and coordinates.
- Retain city/state, redacted location, provider-identity hash, approval digest, and evidence that a verified address existed.
- Do not alter the current address while the event still needs it operationally.
- Do not purge evidence under an active dispute, enforcement case, support hold, or legal hold.

Historical exact addresses never appear in ordinary admin lists, logs, analytics, search DTOs, or public responses.

The exact retention duration must be approved through legal/privacy review before public launch. Record it in `docs/adr/007-sensitive-address-retention.md`.

### Imported and scraped inventory

Add:

`EventOrigin = OWNER_CREATED | ADMIN_IMPORTED | PARTNER_FEED`

#### Database invariants

`OWNER_CREATED` requires:

- Verified user owner and organizer.
- Normal approval snapshot.
- Stripe publication payment before publication.
- Full owner-created editing and immutable purchase rules.

Imported/partner events:

- Have no fabricated owner.
- Have no Stripe publication payment.
- Have no user approval snapshot or terms acceptance.
- Require a source record.
- Use an origin-specific visibility predicate.
- Cannot be converted in place into a paid owner event.

Add `ImportedEventSource` with:

- Source name, URL, and source event ID.
- Imported and last-checked timestamps.
- Attribution and usage-rights notes.
- Claim status.
- Removal status.
- Freshness/expiration status.
- Optional single sourced-cover reference.

Imported media generally uses no hosted image or one properly sourced cover. Never mirror full external galleries.

Claim flow:

- An organizer may submit a controlled claim.
- Approval of the claim creates or prefills a new `OWNER_CREATED` draft.
- The organizer must complete verification, upload owned media, approve, accept terms, and pay normally.
- Once the paid replacement publishes, the imported record is marked `REPLACED` and may redirect to the new canonical event.
- No imported status, source relationship, or prior traffic bypasses the normal paid workflow.

Imports never create users or send email. Detailed scraping/partner ingestion is outside the paid vertical slice and remains post-launch unless separately scheduled.

### Updated schema additions

Add or revise:

- `User`: custom auth fields, `emailVerifiedAt`, role/restriction metadata.
- `Session`: token hash, user, expiry, creation, bounded device metadata.
- `EmailVerificationToken` and `PasswordResetToken`.
- `EmailDelivery` or a typed email-outbox job using the existing durable work table.
- `Event.origin`.
- Nullable owner/organizer only where an origin-specific database constraint permits imported events.
- `ImportedEventSource`.
- `EventPhoto`: one retained sanitized display path and thumbnail path plus reservation/staging state.
- `LocationChangeRequest`.
- Split approval proof core from sensitive address evidence/retention metadata.
- Stable canonical path independent of geography.

Database check constraints must enforce origin-specific ownership/payment/source rules rather than relying only on application code.

### Updated route table

| Route | Purpose |
|---|---|
| `/` | Homepage. |
| `/estate-sales` | Bakersfield estate-sale editorial hub. |
| `/yard-sales` | Bakersfield yard-sale editorial hub. |
| `/estate-sales/[slug]-[publicId]` | Stable estate-sale detail. |
| `/yard-sales/[slug]-[publicId]` | Stable yard-sale detail. |
| `/locations/[state]/[city]/estate-sales` | Future explicitly approved location hub. |
| `/locations/[state]/[city]/yard-sales` | Future explicitly approved location hub. |
| `/organizers/[slug]` | Organizer profile. |
| `/search` | Nationwide noindex search. |
| `/media/[photoId]/[variant]` | Stable visibility-controlled sanitized media. |
| `/signup`, `/login` | Custom account flows. |
| `/verify-email`, `/forgot-password`, `/reset-password` | Token confirmation and recovery pages. |
| `/dashboard/organizer` | Organizer management. |
| `/dashboard/events`, `/dashboard/events/new` | Owner event management. |
| `/dashboard/events/[id]/edit`, `/preview`, `/payment` | Draft/publishing workflow. |
| `/dashboard/favorites` | Saved events. |
| `/admin/...` | Enforcement, payment, report, import, and audit operations. |

Key APIs:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/sessions`
- `DELETE /api/auth/sessions/[sessionId]`
- `POST /api/auth/sessions/revoke-all`
- Existing event, checkout, payment-status, favorite, report, search, webhook, media reservation/finalization, and cron routes remain.
- `GET /media/[photoId]/[variant]` is the only public event-media URL.
- Import APIs remain admin/internal and outside the initial vertical slice.

## 3. Updated Roadmap and Acceptance Criteria

### Phase 1 â€” Minimal foundation and custom auth primitives

Classification: first vertical-slice foundation.

Deliver:

- Repository/package configuration.
- Strict TypeScript and module boundaries.
- Environment validation.
- Neon/PostGIS and Prisma migration workflow.
- CI.
- Basic unit, integration, and Playwright infrastructure.
- Structured logging and baseline error tracking.
- Security headers.
- Minimal durable job/outbox mechanism.
- Dependency compatibility validation.
- Custom password, token, session, cookie, and authorization primitives.
- Initial Vercel Blob contract validation through `MediaStore`.

Acceptance:

- Clean install, migration, typecheck, test, and production build.
- Argon2id hashing works within Vercel resource limits.
- Random sessions store only hashes and expired sessions fail.
- Session create, read, rotate, logout, revoke-one, and revoke-all primitives pass integration tests.
- `requireUser` and `requireAdmin` work without leaking database records.
- Auth secrets/tokens are absent from logs.
- One durable test job retries safely.
- Vercel Blob adapter can issue event-scoped private upload authorization, inspect, read, sign, and delete a test object.
- Runtime and dependencies are pinned in repository configuration.
- Authentication and Blob-provider ADRs are committed.
- No dual-auth prototype or alternative storage adapter is built.

### Phase 2 â€” Complete account and organizer workflows

Deliver:

- Signup and login.
- Email verification/resend.
- Password reset.
- Session rotation and revocation UI.
- Basic distributed rate limits.
- User/admin roles.
- Organizer profile.
- Resend email integration.

Administrator TOTP remains required before public launch but does not block Phase 4 unless an administrator is required for the test.

Acceptance:

- Enumeration-safe signup/login/verification/reset tests pass.
- Verification/reset tokens are hashed, expiring, single-use, and transactional.
- Verification rotates the session.
- Reset revokes every existing session.
- Unverified users can log in, create organizer data, and create text-only drafts.
- Unverified users cannot reserve/upload/finalize media, approve, accept terms, check out, or publish.
- Resend failures remain recoverable through limited resend/reset actions.
- Imported inventory creates no users or emails.

### Phase 3 â€” Draft, private location, one-photo pipeline, and approval

Deliver:

- Draft event data.
- Private location normalization and timezone handling.
- Optimistic concurrency.
- One-photo private staging/processing flow.
- Stable `/media` route.
- Signed-redirect versus proxy validation and delivery ADR.
- Ready-photo/cover rule.
- Preview.
- Approval proof core and time-limited sensitive address evidence.
- Final terms acceptance.

Acceptance:

- JPEG, PNG, WebP, HEIC, and HEIF inputs produce sanitized display/thumbnail variants.
- EXIF/GPS metadata is absent from retained variants.
- Original staging object is deleted only after final variants are verified.
- Only sanitized variants remain.
- Stable media URLs work with Next Image, galleries, Open Graph, and representative crawlers.
- Draft media is owner/admin-only.
- Suspended/deleted media fails at the application route.
- Approval requires one event-owned ready photo and cover.
- Concurrent edits conflict safely.
- Exact addresses never enter public DTOs, logs, or ordinary admin lists.
- Canonical event path generation contains no geographic component.

### Phase 4 â€” First complete paid-publication proof

Demonstrate:

1. Account creation.
2. Email verification.
3. Organizer creation.
4. Event draft.
5. One ready photo and cover.
6. Address/timezone validation.
7. Preview.
8. Approval.
9. Terms acceptance.
10. Stripe Checkout.
11. Signed webhook receipt.
12. Idempotent fulfillment.
13. Automatic publication.
14. Stable non-geographic canonical URL.
15. Public event page and stable media.
16. Reconciliation after simulated fulfillment failure.

Acceptance:

- Redirect cannot publish.
- Wrong/stale/unpaid/photo-invalid attempts cannot fulfill.
- Duplicate and out-of-order webhooks remain idempotent.
- One payment cannot fulfill multiple events.
- Simulated post-payment database failure reconciles without another payment.
- Published path matches `/estate-sales/[slug]-[publicId]` or `/yard-sales/[slug]-[publicId]`.
- Page title, H1, metadata, breadcrumb, JSON-LD, and labels include city/state despite the non-geographic URL.
- Search breadth, imported inventory, final UI design, and advanced admin tools do not delay this proof.

### Phase 5 â€” Full media, published editing, relocation, and cleanup

Preserve the previous scope with these additions:

- Full 150-photo behavior.
- Safe one-photo replacement sequence.
- Final post-payment address policy.
- Location-change requests.
- 24-hour ended-media cleanup.
- Historical exact-address retention/purge mechanism.

Acceptance:

- Active publication never lacks a ready photo/cover.
- Normalization of the same address applies automatically.
- Primary street-number, street-name, provider identity, coordinate, ZIP, locality, state, venue, and timezone changes enter review.
- Distance alone never authorizes a change.
- Unrelated/over-area relocation requires a new event/payment.
- Canonical URL remains unchanged after approved correction.
- Cleanup eligibility is exactly `endsAt + 24 hours`.
- Archived pages keep required text, organizer, date, city/state, canonical URL, and bundled placeholder.
- Exact historical address purge preserves proof digest and financial history.

### Phase 6 â€” Search, favorites, and editorial discovery

Preserve PostgreSQL FTS, PostGIS, synchronized list/map, filters, cursors, favorites, and noindex search.

Use `/estate-sales` and `/yard-sales` as Bakersfield editorial hubs. Imported ingestion remains outside this phase unless separately scheduled; the schema may display manually approved imported records.

### Phase 7 â€” Enforcement, incidents, reports, and admin security

Preserve enforcement/payment-incident scope and add:

- Administrator TOTP.
- Imported-source review/removal/claim visibility if imports are enabled.
- Historical-address access restricted to explicit event/payment detail with audit.

### Phases 8â€“10

SEO, accessibility, monitoring, backup hardening, rollout, and post-launch improvements remain as previously frozen, adjusted for:

- Non-geographic event URLs.
- Stable media URLs.
- Exact-address retention policy.
- Imported pages being noindex by default unless intentionally approved.
- Automated scraping remaining post-launch/out of scope.

## 4. Updated Test Requirements

### Authentication

- Argon2id hash/verify and rehash policy.
- Session tokens have sufficient entropy and only hashes persist.
- Secure host-only cookie attributes.
- Expired/revoked/rotated tokens fail.
- Logout deletes only current session.
- Individual and global revocation.
- Reset revokes all sessions.
- Verification/reset token expiry, single use, invalidation, and scanner-safe POST consumption.
- Enumeration-safe responses and timing checks.
- Unverified login and text-only draft access.
- Unverified media/approval/terms/checkout/publication denial.
- Ownership inside commands.
- Rate-limit behavior.
- Admin authorization and audit.

### Email

- Verification/resend/reset recipient and URL generation.
- No email on nonexistent-account recovery response.
- Resend failure remains recoverable.
- Publication/enforcement outbox retries idempotently.
- Imported events never trigger auth or publication emails.
- No provider SDK types escape `EmailService`.

### Media

- `MediaStore` contract for authorization, verification, read/sign, metadata, and deletion.
- Invalid reservation/path/object/event ownership fails.
- Retained variants contain no EXIF/GPS metadata.
- Staging source is not deleted before both variants are verified.
- Successful processing leaves no original.
- Stable media route checks every event state and authorization mode.
- Signed redirect/proxy compatibility with Next Image and crawlers.
- Suspended/removed/deleted/draft media is inaccessible through stable routes.
- Active one-photo replacement preserves a ready cover at every committed step.
- Existing concurrency, limit, ordering, cover, cleanup, and retry tests remain.

### URLs and address changes

- Canonical paths contain no city/state/ZIP.
- Path remains stable after title, organizer-display, or approved address correction.
- Local context remains in metadata, H1, JSON-LD, cards, and breadcrumbs.
- Automatic normalization only applies to the same provider address identity.
- Primary street-number changes never auto-apply.
- Distance alone cannot authorize.
- Review/reject flows preserve the old public address until approval.
- Paid event cannot become another sale.

### Address retention

- Exact historical data remains available only before `retainUntil` or under hold.
- Purge preserves city/state, redacted evidence, provider hash, and snapshot digest.
- Payment records remain intact after address purge.
- Ordinary admin lists/logs/public projections never include historical exact addresses.
- Legal-hold and active-dispute records are not purged.

### Imported inventory

- Origin-specific database constraints.
- Imported event can publish without a fake owner/payment only through the imported visibility path.
- Owner-created event cannot publish without payment.
- Imported source/attribution/freshness/removal behavior.
- No imported gallery mirroring beyond permitted cover.
- Import creates no account or verification email.
- Claim produces a new owner-created draft; it cannot mutate the import into a paid listing.
- Paid replacement follows normal approval/payment/photo rules.

All previously frozen payment, lifecycle, privacy, search, enforcement, cleanup, concurrency, accessibility, CI, and recovery tests remain required.

## 5. Updated Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Custom auth security burden | Small explicit auth module, Argon2id, opaque hashed tokens, centralized guards, strict contract/integration tests, audit, dependency/security review, no extra auth methods. |
| Session theft/fixation | Host-only secure cookies, new session after authentication, sensitive-event rotation, revocation, expiry, no raw token persistence. |
| Verification email cost/deliverability | Resend interface, 24-hour tokens, resend limits, verified domain, provider status tracking, low initial email scope. |
| Unverified-user abuse | Text-only drafts only; distributed limits; no uploads, payment, approval, or publication before verification. |
| Vercel Blob lock-in | Provider-neutral `MediaStore`; no SDK types in domain modules; future R2 adapter can be added without product rewrites. |
| Signed redirect/crawler incompatibility | Stable application URL, Phase 3 crawler/Next Image contract tests, private proxy fallback. |
| Private proxy bandwidth/function cost | Prefer signed redirect if valid; measure gallery and crawler traffic before choosing proxy. |
| Brief access after suspension through an issued signed URL | Maximum 60-second signature; stable app route blocks immediately; already downloaded bytes are inherently non-revocable. |
| Loss of originals limits regeneration | Verify both final variants before deletion; retry processing while staging remains; short failure TTL. No indefinite original retention. |
| Non-geographic URL weakens location signal | City/state in title, H1, metadata, JSON-LD, breadcrumbs, anchor text, search cards, and internal links. |
| Address corrections become overly permissive | Only same-identity normalization auto-applies; substantive changes always review; distance is evidence only. |
| Historical residential address privacy | Separate sensitive evidence, explicit TTL/hold, restricted access, redacted long-term proof. |
| Imported listings imply false ownership/payment | Explicit origin constraints, source attribution, nullable ownership only for imports, separate visibility predicates, no fake accounts. |
| Scraping copyright/staleness | No automated scraping in vertical slice; no full gallery mirroring; source rights, attribution, last-checked, freshness, and removal records. |
| Imported record bypasses paid publishing | Claims create a separate owner-created draft that must complete verification, media, approval, terms, and payment. |

Previously frozen risks concerning Stripe races, duplicate/out-of-order webhooks, payment inconsistencies, address leakage, media concurrency, cleanup isolation, Cron retries, PostGIS queries, disputes, environment separation, and no moderation queue remain unchanged.

## 6. External Prerequisites

Required before public launch:

- Legal approval of non-refundable terms and tax treatment.
- Privacy/legal approval of the exact historical-address retention period and hold policy.
- Legal/source-rights policy for imported event text, attribution, cover images, removal, and claims.
- Verified Resend sending domain and confirmation that anticipated transactional volume fits the selected allowance.
- Vercel Pro project with private Blob and signed-access capability enabled.
- Stripe live Product/Price and signed webhook.
- Mapbox account permitting permanent geocoding storage.
- Separate production/staging Neon, Blob, Upstash, Stripe, Mapbox, Resend, and Vercel credentials.
- Named initial administrators and TOTP recovery custody.

Provider contract validation for the selected dependencies is Phase 1 implementation work, not an unresolved architecture decision.

## 7. Freeze Confirmation

- Custom opaque PostgreSQL sessions are the final authentication architecture.
- Vercel Blob is the final initial storage provider.
- Only one retained sanitized set of media variants is used.
- Stable application-controlled media URLs are mandatory.
- Event canonical URLs contain no mutable geography.
- Post-payment substantive address changes require review.
- The 24-hour media-cleanup rule remains fixed.
- Imported inventory has explicit non-owner origins and cannot bypass paid publishing.
- No unresolved architecture decision blocks Phase 1.
- Only the signed-redirect-versus-private-proxy delivery mechanism remains an explicitly required implementation validation within the already selected Vercel Blob architecture.

