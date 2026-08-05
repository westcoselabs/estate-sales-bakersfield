export type ListingIngestionCredentialErrorCode =
  | "INVALID_SOURCE_KEY"
  | "INVALID_CREDENTIAL_NAME"
  | "SOURCE_NOT_FOUND"
  | "SOURCE_DISABLED"
  | "SOURCE_NOT_PRODUCTION_ALLOWED"
  | "TOKEN_GENERATION_FAILED";

export class ListingIngestionCredentialError extends Error {
  override readonly name = "ListingIngestionCredentialError";

  constructor(
    readonly code: ListingIngestionCredentialErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
