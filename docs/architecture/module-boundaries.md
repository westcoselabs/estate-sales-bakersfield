# Module Boundary Policy

Each feature module may expose a small public entry point. Its domain layer contains provider-free types and policies. Its application layer defines use-case services and ports and may depend on its own domain. Its infrastructure layer implements those ports with Prisma, Next.js, or provider SDKs. `src/app` composes modules and handles HTTP concerns.

Forbidden dependencies are executable in `dependency-cruiser.cjs`:

- circular imports;
- domain to infrastructure, platform, or App Router;
- application to infrastructure or App Router;
- feature modules to App Router;
- `@vercel/blob` outside media infrastructure.
- `resend` outside authentication infrastructure;
- `@upstash/redis` outside authentication infrastructure.

Phase 2 adds `src/modules/organizers` as a separate feature module. Its application service accepts the authenticated user ID supplied by the transport composition layer, and its Prisma repository enforces the one-profile-per-user ownership key. Neither organizer domain nor application code imports Prisma, Next.js, Resend, or Upstash types.

Phase 1 media scopes are intentionally application-owned opaque values. The adapter accepts `{environment}/{resourceScope}/{reservationId}/{randomName}` and has no event database dependency. Phase 3 will bind those inputs to authenticated event ownership, photo reservations, and media records without changing the provider-neutral storage port.
