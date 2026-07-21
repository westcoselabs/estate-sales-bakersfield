# ADR 009: Private media processing and stable delivery

Status: accepted for Phase 3

## Decision

Use direct, short-lived, path/size/content-type-scoped private upload authorization through `MediaStore`. Object keys are server-generated and environment-prefixed. Clients never submit Blob paths. Reservation, event, photo, and owner identity are rechecked in database transactions.

Sharp runs only in media infrastructure. It decodes allowed raster formats with an input-pixel cap, applies orientation, converts to sRGB, strips source metadata by re-encoding, and creates immutable WebP variants for dashboard thumbnail, listing card, gallery, and cover display. All final objects are inspected before the staging object is removed. Partial final writes are settled and cleaned before failure is returned.

Stable `/media/[photoId]/[variant]` routes proxy private objects through an allowlisted variant and application authorization. During Phase 3 drafts, only the owner or an active administrator admitted by the centralized guard can read media. Responses are private/no-store and never expose Blob keys or provider URLs. Future public visibility is a Phase 4 transition.

## Consequences

Application URLs survive provider changes, private originals are not retained, EXIF/GPS data is absent from variants, and a provider failure cannot mark a photo `READY`. The test filesystem adapter is confined to `.tmp`, signed, and refuses every non-Test environment.
