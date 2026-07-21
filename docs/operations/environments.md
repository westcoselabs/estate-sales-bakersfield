# Application Environments

The only valid `APP_ENV` values are `local`, `test`, `preview`, and `production`.

| Environment | Database                                       | Email/rate limits/media/location                                       |
| ----------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| Local       | Preview Neon when manual persistence is needed | Capture email where configured; non-Production provider resources only |
| Test        | Persistent isolated Test Neon                  | Capture email, deterministic limits/location, `.tmp` media             |
| Preview     | Isolated Preview Neon                          | Isolated Preview Upstash, Resend, Blob, Mapbox                         |
| Production  | Reserved Production Neon                       | Reserved Production resources; never used by development checks        |

Deployed database and provider credentials require an explicit resource marker matching `APP_ENV`: `DATABASE_RESOURCE_ENV`, `BLOB_RESOURCE_ENV`, `UPSTASH_RESOURCE_ENV`, `RESEND_RESOURCE_ENV`, and `MAPBOX_RESOURCE_ENV`. This cannot cryptographically identify a vendor account, so human resource review remains required, but it prevents accidental use when a credential is paired with a mismatched declared scope.

Preview application links derive from the validated active Vercel deployment hostname. Production is never a fallback for Preview. Test commands load only `.env.test.local`, override runtime database URLs with the guarded Test URLs, and strip common real provider credentials.
