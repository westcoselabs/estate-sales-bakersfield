export type ListingImportReviewErrorCode =
  | "ACTOR_NOT_AUTHORIZED"
  | "CANDIDATE_NOT_FOUND"
  | "EXTERNAL_LISTING_NOT_FOUND"
  | "STALE_VERSION"
  | "INVALID_LIFECYCLE"
  | "INVALID_CANDIDATE_CONTENT"
  | "LOCATION_REQUIRED"
  | "UNRESOLVED_DUPLICATES"
  | "DUPLICATE_MATCH_NOT_FOUND"
  | "DUPLICATE_NO_LONGER_CURRENT"
  | "INVALID_CONFIRMATION"
  | "PUBLIC_ID_ALLOCATION_FAILED";

export class ListingImportReviewError extends Error {
  override readonly name = "ListingImportReviewError";

  constructor(
    readonly code: ListingImportReviewErrorCode,
    readonly status: 403 | 404 | 409 | 422 | 503,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export function reviewStaleVersion(): ListingImportReviewError {
  return new ListingImportReviewError(
    "STALE_VERSION",
    409,
    "The listing changed. Refresh and try again.",
  );
}
