# ADR 002: Vercel Private Blob Behind MediaStore

Status: accepted provider; live contract validation pending credentials if not recorded as passed in the Phase 1 report.

## Decision

Use Vercel Private Blob as the only launch storage adapter behind the application-owned `MediaStore` port. Provider objects and SDK types cannot escape `src/modules/media/infrastructure`. The port supports private upload authorization, metadata inspection, private reads, temporary read access, deletion, and batch cleanup. A future R2 adapter can implement the same capabilities without rewriting product-domain logic, but no second adapter is built now.

## Phase 1 scope

Object keys are domain-neutral opaque scopes: `{environment}/{resourceScope}/{reservationId}/{randomName}`. Credential-free contracts validate types, path safety, error mapping, SDK isolation, and a test double. The live contract independently authorizes, uploads, inspects, reads and compares bytes, consumes temporary read access, deletes, confirms absence, and cleans up in `finally` against an isolated non-production private store.

There are no event/photo/reservation tables or ownership lookups in this adapter during Phase 1. Phase 3 binds authorization to real event ownership and media records. It also decides signed redirect versus application proxy for stable application-controlled media URLs; that delivery validation does not reopen the selected provider.

## Provider validation

The selected `@vercel/blob` release exceeds the documented private-store minimum and supports operation/path/expiry-scoped signed PUT and GET URLs, including direct browser PUT uploads. Private objects remain authenticated and can also be streamed with `get()`. Sources checked during bootstrap: [Vercel signed URLs](https://vercel.com/changelog/signed-urls-are-now-available-for-vercel-blob) and [Vercel private storage](https://vercel.com/docs/vercel-blob/private-storage).
