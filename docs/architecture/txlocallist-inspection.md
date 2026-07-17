# txlocallist Inspection Record

Phase 1 began by inspecting `C:/Users/citry/OneDrive/Desktop/txlocallist`, its existing `graphify-out` graph, and the referenced authentication/session source. Graphify was used for navigation, then every adopted pattern was confirmed against current source because the graph represented commit `bd9486ba` while the inspected clean worktree was at `e979d9e697472d5fa22a95faeb1b939a5027db7f`.

Adopted patterns from `src/lib/auth/session.js` include 32-byte random opaque tokens, SHA-256 token digests in the database, database-backed expiry, host-only HTTP-only cookies, and centralized `requireUser`/`requireAdmin` authorization. The implementation also preserves narrow session/user projections and ownership checks at command boundaries.

The source implementation was not copied wholesale. Its scrypt password design, missing email verification/reset lifecycle, limited rotation/revocation support, broad fallback behavior, and incomplete rate-limit/audit controls do not meet this platform's frozen requirements. This repository uses Argon2id and explicit ports/services so Phase 2 can add the required account workflows without changing the session architecture.

No files in `txlocallist` or its Graphify output were changed.
