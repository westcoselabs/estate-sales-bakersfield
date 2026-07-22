# Application Environments

The only valid `APP_ENV` values are `local`, `test`, `preview`, and `production`.

| Environment | Database                                       | Provider behavior                                                                                         |
| ----------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Local       | Preview Neon when manual persistence is needed | PostgreSQL limits; capture email; deterministic Stripe by default; non-Production resources only          |
| Test        | Persistent isolated Test Neon                  | Scoped limits, capture email, fixture media/location, deterministic Stripe; real provider keys prohibited |
| Preview     | Isolated Preview Neon                          | Isolated Preview Resend/Blob/Mapbox plus Stripe test-mode Product, Price, key, and webhook                |
| Production  | Reserved Production Neon                       | Reserved Production resources; configuration and resources untouched by Phase 4 checks                    |

Deployed database and provider credentials require an explicit resource marker matching `APP_ENV`: `DATABASE_RESOURCE_ENV`, `BLOB_RESOURCE_ENV`, `RESEND_RESOURCE_ENV`, `MAPBOX_RESOURCE_ENV`, and `STRIPE_RESOURCE_ENV`. This cannot cryptographically identify a vendor account, so human resource review remains required, but it prevents accidental use when a credential is paired with a mismatched declared scope. Preview additionally requires `STRIPE_MODE=test` and a test secret-key prefix; Test rejects real Stripe credentials. Production requires a separate explicit live configuration but remains unset and unvalidated in Phase 4.

Preview application links derive from the validated active Vercel deployment hostname. Production is never a fallback for Preview. Test commands load only `.env.test.local`, override runtime database URLs with the guarded Test URLs, and strip common real provider credentials. `TEST_RUN_ID` is accepted only in `APP_ENV=test` and produces a hashed PostgreSQL rate-limit scope; it is not an authentication bypass.

The frozen roadmap defines no final listing fee. Preview operators must set all of `STRIPE_PRICE_ID`, `STRIPE_EXPECTED_AMOUNT` (minor units), and `STRIPE_EXPECTED_CURRENCY` from an approved test Product/Price. The values are server-only and validated again against the retrieved line item. The browser never submits an amount. Local/Test display `$12.34` only as a clearly marked fixture, not a business decision.
