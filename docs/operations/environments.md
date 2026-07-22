# Application Environments

The only valid `APP_ENV` values are `local`, `test`, `preview`, and `production`.

| Environment | Database                                       | Email/rate limits/media/location                                                |
| ----------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Local       | Preview Neon when manual persistence is needed | PostgreSQL rate limits; capture email; non-Production provider resources only   |
| Test        | Persistent isolated Test Neon                  | Scoped PostgreSQL rate limits, capture email, fixture location, `.tmp` media    |
| Preview     | Isolated Preview Neon                          | PostgreSQL rate limits plus isolated Preview Resend, Blob, and Mapbox           |
| Production  | Reserved Production Neon                       | PostgreSQL rate limits plus reserved Production resources; never used by checks |

Deployed database and provider credentials require an explicit resource marker matching `APP_ENV`: `DATABASE_RESOURCE_ENV`, `BLOB_RESOURCE_ENV`, `RESEND_RESOURCE_ENV`, and `MAPBOX_RESOURCE_ENV`. This cannot cryptographically identify a vendor account, so human resource review remains required, but it prevents accidental use when a credential is paired with a mismatched declared scope.

Preview application links derive from the validated active Vercel deployment hostname. Production is never a fallback for Preview. Test commands load only `.env.test.local`, override runtime database URLs with the guarded Test URLs, and strip common real provider credentials. `TEST_RUN_ID` is accepted only in `APP_ENV=test` and produces a hashed PostgreSQL rate-limit scope; it is not an authentication bypass.
