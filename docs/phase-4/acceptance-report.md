# Phase 4 Acceptance Report

Date: 2026-07-21 (America/Los_Angeles)

## Status vocabulary

- **Locally implemented:** yes.
- **Credential-free verified:** yes through focused commands; final aggregate `pnpm verify` is recorded below.
- **Test Neon verified:** yes.
- **Preview configured/live-verified:** no; **BLOCKED** on user-owned Preview deployment and provider resources.
- **Production-ready/launched:** no. Production was out of scope and untouched.

## Starting Git and source-control closeout

The reported uncommitted Phase 3 tree was stale. Inspection found `main` clean at `15c03650fab7bb21abe41d9d6f4fb3f4a1eb1309`, with the Phase 3/3.5 work already contained in the existing local commit. Complete tracked/staged/untracked diffs were empty. Ignored `.env*`, `.tmp`, test media/email, Playwright, Next, and Vercel artifacts were not tracked or staged. A redacted tracked-file scan found no credential; example database URLs contain only explicit placeholders.

Local branch `phase-3-closeout` was created at the existing verified commit; no misleading empty duplicate commit was added. Baseline `pnpm verify` passed with 85 unit, 31 integration, 5 Playwright, 14 Blob, 3 email, 2 location, and 1 image test. Local branch `phase-4-stripe-publication` was then created from the same commit. Nothing was pushed, merged, deployed, or promoted.

## Implemented architecture

- Regular Stripe account, one-time hosted Checkout Sessions, cards only; no Connect, cart, Elements, embedded Checkout, subscription, marketplace, or card collection.
- Application-owned provider port with real Stripe adapter, deterministic fake, environment composition, safe errors, create/retrieve/expire/signature verification, and offline transport contracts.
- Server-owned Price ID, expected minor-unit amount, and currency. The roadmap defines no final fee; Local/Test `$12.34` is an unmistakable fixture only. Preview remains manually configured.
- Authenticated owner-only Checkout creation with exact organizer/event/approval/revision/digest, schedule/location/photo/cover, optimistic version, publication, and compatible-active-attempt checks. Internal attempt creation precedes provider creation and uses a non-PII idempotency key.
- Raw-body signed webhook, supported-event allowlist, unique event receipt, duplicate success no-op, bounded body/evidence, and no redirect authority.
- One reusable fulfillment service shared by webhook and reconciliation. It retrieves authoritative Session/line-item evidence and revalidates Session ID, metadata/environment, Price/amount/currency/quantity, payment intent/status, ownership, organizer, approval/revision/digest, schedule, projection, media, and publication conflict.
- Serializable publication transaction records payment, creates one immutable snapshot, appends payment/publication audits, and marks fulfillment complete. Paid stale/mismatched attempts become explicit `BLOCKED` without publication or automatic refund.
- Stable estate/yard detail routes, canonical redirects, not-found before publication, published-snapshot rendering, public media authorization, metadata/Open Graph/JSON-LD, and Next path invalidation.
- Hidden-until-start runtime projection uses only city/region/country/release time before start. Public pages, metadata, structured data, cache output, and image authorization use the same publication gate and expose no coordinate or premature street address.
- Dashboard/editor/preview/payment/success/cancel surfaces cover all Phase 4 state labels and show a server-returned price. Success polling reads internal state and cannot publish.
- Deduplicated `PAYMENT_RECONCILE` durable jobs, candidate discovery, existing bounded retry/dead-letter/stale-lock behavior, authenticated runner registration, and controlled manual script. Cancel return now expires an open provider Session before permitting a replacement.
- Payment-specific Pino/Sentry redaction covers keys, signatures, webhook bodies, and Checkout/session URLs.

## Migration and database invariants

Forward migration `20260723000000_phase4_paid_publication` adds `payment_attempts`, `stripe_webhook_events`, and `event_publications` with state enums, bounded fields, timestamps, ownership/approval foreign keys, recovery indexes, optimistic version, immutable correlation/server-price trigger, one-active-attempt partial unique index, unique Stripe identifiers/event IDs, one publication per event/attempt/public ID/path, matching-paid-attempt trigger, and immutable publication trigger.

SHA-256 tests prove all four prior migration files are byte-for-byte unchanged. Clean replay ran through the Test Neon global setup. Catalog assertions verified Phase 4 indexes/triggers. A forced invalid publication proved payment state and publication roll back together. Test cleanup explicitly disables only the immutable publication-delete trigger inside the scoped Test-run transaction, deletes test publication/payment rows in dependency order, and never broadens the reset boundary.

## Verification evidence

| Gate                         | Result                                                         |
| ---------------------------- | -------------------------------------------------------------- |
| Format                       | PASS                                                           |
| ESLint                       | PASS, zero warnings                                            |
| Dependency boundaries        | PASS, 224 modules / 497 dependencies                           |
| TypeScript                   | PASS                                                           |
| Prisma validation/generation | PASS                                                           |
| Next production build        | PASS, payment/webhook/public routes present                    |
| Production dependency audit  | PASS, no known vulnerabilities                                 |
| Unit                         | PASS, 101/101                                                  |
| Stripe contract              | PASS, 4/4                                                      |
| Existing contracts           | PASS in final aggregate: Blob 14, email 3, location 2, image 1 |
| Test Neon integration        | PASS, 44/44                                                    |
| Playwright                   | PASS, 6/6 using one deterministic shared-fixture worker        |
| `git diff --check`           | recorded after final aggregate below                           |

The Phase 4 Test Neon suite covers attempt creation/reuse/ownership, immutable exact correlation, stale approval/edit, successful atomic fulfillment, duplicate and older webhook events, wrong event/revision/digest/amount/currency/Price, unpaid completion, rollback, publication immutability, paid-blocked state, reconciliation success/retry/job registration, pre-publication absence, post-publication projection, and hidden-address privacy. Existing job unit/integration tests retain bounded retry, dead-letter, and stale-lock proofs. Playwright proves success redirect alone cannot publish, fake signed fulfillment publishes, the dashboard links the live listing, and an edit-after-Checkout payment remains private.

### Final aggregate

`pnpm verify`: **PASS** (exit 0). The first aggregate attempt exposed a timing-sensitive pre-existing concurrent token-issuance race; verification/reset issuance transactions were moved to PostgreSQL `SERIALIZABLE` isolation with generic conflict handling. The exact Test Neon race passed three stress repetitions, and the complete aggregate rerun passed.

`git diff --check`: **PASS**.

## Preview manual actions and blocked checks

Create/confirm an isolated Preview Neon/Blob/Resend/Mapbox set and a regular Stripe account in test mode. In Stripe, create a one-time test Price with a product-owner-approved amount/currency; register the exact Preview `/api/webhooks/stripe` endpoint and completion/async-success/async-failure/expiry events. Configure Vercel **Preview only** with:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`
- `STRIPE_EXPECTED_AMOUNT`
- `STRIPE_EXPECTED_CURRENCY`
- `STRIPE_MODE=test`
- `STRIPE_RESOURCE_ENV=preview`
- the existing `APP_URL`, Preview database/provider credentials, matching resource markers, and `CRON_SECRET`

Then deploy a non-Production Preview, run `prisma migrate deploy` against Preview Neon only, and execute the checklist in `docs/operations/preview-verification.md`: account email, Blob upload, Mapbox location, successful/canceled test-card Checkout, webhook delivery and duplicate replay, delayed-webhook reconciliation, stale paid revision, public privacy/metadata/media, and scheduled job execution. All of those live provider/deployment checks are **BLOCKED / NOT RUN**, not passing.

## Production-beta promotion addendum

The post-Phase-4 promotion path introduces an explicit server-only `PRODUCTION_BETA_MODE` gate. Production with the gate enabled accepts only Stripe test mode and an `sk_test_...` key while retaining the real hosted Checkout provider, signed webhook authority, and inaccessible fake-control routes. Production without the gate retains the existing live-only protection. The stable Production endpoint requires a newly created Stripe test webhook signing secret; Preview secrets and variables remain unchanged.

Production-beta deployment, Production migration execution, and hosted payment/webhook evidence are operational gates and must be recorded separately after completion. A successful redirect is not payment evidence; acceptance requires a signed test webhook response and exactly-once publication.

## Deferred work

Final live business price/currency, live Production Stripe Product/Price/key/webhook, legal/tax/refund decisions, refund UI, coupons/packages, subscriptions, Connect/marketplace payouts, custom/embedded Checkout, paid editing/relocation, search/maps/discovery, imports, favorites, advanced administration, and final live launch remain explicitly deferred.

No secret values were printed or committed. Production resources were not accessed. Nothing was pushed, merged, opened as a pull request, or deployed.
