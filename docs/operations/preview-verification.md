# Preview Verification

## Safety gate

1. Confirm the current Git branch is not the configured Vercel Production Branch, or use an explicit Preview deployment command.
2. Confirm `APP_ENV=preview` without printing secrets.
3. Confirm Preview-only Neon, Upstash, Resend, Blob, and Mapbox resources and matching `*_RESOURCE_ENV=preview` markers, including `DATABASE_RESOURCE_ENV=preview`.
4. Apply `prisma migrate deploy` only to Preview Neon. Never run `prisma db push`.
5. Use an approved controlled email recipient or provider test mode.

## Phase 2 workflow

Register, receive verification, verify, log in, persist the session, complete onboarding, logout/login, request and receive reset, reset, verify prior-session revocation, reject the old password, accept the new password, and exercise safe provider failures.

## Phase 3 workflow

Create and resume a draft; save details/schedule; validate a Bakersfield address and all three privacy projections; upload and sanitize a photo; choose/reorder/delete photos; choose a ready cover; verify stable media; compare exact preview with the future projector; accept current terms; approve; edit material content; verify invalidation; re-preview/reapprove; and verify cross-user denial. Clean only controlled test data and isolated Preview Blob objects.

Unavailable resources are `BLOCKED` with the missing manual action. They do not turn into `PASS`. Do not deploy with `--prod`, promote, assign the public domain, or configure Production resources.
