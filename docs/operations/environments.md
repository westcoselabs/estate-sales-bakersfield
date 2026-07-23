# Application Environments

The only valid `APP_ENV` values are `local`, `test`, `preview`, and `production`.

| Environment | Database                                       | Provider behavior                                                                                         |
| ----------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Local       | Preview Neon when manual persistence is needed | PostgreSQL limits; capture email; deterministic Stripe by default; non-Production resources only          |
| Test        | Persistent isolated Test Neon                  | Scoped limits, capture email, fixture media/location, deterministic Stripe; real provider keys prohibited |
| Preview     | Isolated Preview Neon                          | Isolated Preview Resend/Blob/Mapbox plus Stripe test-mode Product, Price, key, and webhook                |
| Production  | Production Neon                                | Production resources; live Stripe by default, or real Stripe test Checkout behind the explicit beta gate  |

Deployed database and provider credentials require an explicit resource marker matching `APP_ENV`: `DATABASE_RESOURCE_ENV`, `BLOB_RESOURCE_ENV`, `RESEND_RESOURCE_ENV`, `MAPBOX_RESOURCE_ENV`, and `STRIPE_RESOURCE_ENV`. This cannot cryptographically identify a vendor account, so human resource review remains required, but it prevents accidental use when a credential is paired with a mismatched declared scope. Preview requires `STRIPE_MODE=test` and a test secret-key prefix; Test rejects real Stripe credentials.

Production normally requires `STRIPE_MODE=live` and an `sk_live_...` secret key whenever Stripe is configured. A deliberate hosted beta may set the server-only `PRODUCTION_BETA_MODE=true`; that combination instead requires `STRIPE_MODE=test` and an `sk_test_...` key and rejects live credentials. The flag is invalid outside Production. It changes credential validation only: Production beta still uses the real Stripe-hosted Checkout adapter, signed webhook fulfillment, and Production resource markers, while deterministic checkout and test-control routes remain limited to Local/Test. Removing the flag restores the live-only Production guard and must happen only as part of a separately approved live launch.

Preview application links derive from the validated active Vercel deployment hostname. Production is never a fallback for Preview. Test commands load only `.env.test.local`, override runtime database URLs with the guarded Test URLs, and strip common real provider credentials. `TEST_RUN_ID` is accepted only in `APP_ENV=test` and produces a hashed PostgreSQL rate-limit scope; it is not an authentication bypass.

The frozen roadmap defines no final listing fee. Preview operators must set all of `STRIPE_PRICE_ID`, `STRIPE_EXPECTED_AMOUNT` (minor units), and `STRIPE_EXPECTED_CURRENCY` from an approved test Product/Price. The values are server-only and validated again against the retrieved line item. The browser never submits an amount. Local/Test display `$12.34` only as a clearly marked fixture, not a business decision.

The stable Production beta uses a Production-only database and Blob store but may deliberately reuse approved Preview Resend, Mapbox, and Stripe test resources. Every reused provider credential still carries a `production` resource marker because the marker describes the application deployment consuming it. The stable Production webhook must have its own test-mode endpoint signing secret; a Preview endpoint secret must never be reused.
