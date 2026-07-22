# Module Boundary Policy

Each feature module may expose a small public entry point. Its domain layer contains provider-free types and policies. Its application layer defines use-case services and ports and may depend on its own domain. Its infrastructure layer implements those ports with Prisma, Next.js, or provider SDKs. `src/app` composes modules and handles HTTP concerns.

Forbidden dependencies are executable in `dependency-cruiser.cjs`:

- circular imports;
- domain to infrastructure, platform, or App Router;
- application to infrastructure or App Router;
- feature modules to App Router;
- `@vercel/blob` outside media infrastructure.
- `resend` outside authentication infrastructure;
- Next.js, Prisma, Resend, Vercel Blob, or Sharp in domain/application layers;
- Prisma generated code in App Router or feature domain/application layers;
- `sharp` outside media infrastructure.

Phase 2 adds `src/modules/organizers` as a separate feature module. Its application service accepts the authenticated user ID supplied by the transport composition layer, and its Prisma repository enforces the one-profile-per-user ownership key. Neither organizer domain nor application code imports Prisma, Next.js, or Resend types.

Media scopes remain application-owned opaque values. Phase 3 binds server-generated scopes to authenticated event ownership and database reservations without letting Blob paths or SDK types escape infrastructure. Location validation follows the same provider-neutral rule. Event App Router handlers import the module public entry point, not Prisma repositories or provider adapters.
