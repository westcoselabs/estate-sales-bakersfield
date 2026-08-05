import type { ListingImportValidationCode } from "./types";

export type ListingImportErrorCode =
  | "INVALID_ENVELOPE"
  | "UNSUPPORTED_CONTRACT_VERSION"
  | "SOURCE_NOT_FOUND"
  | "SOURCE_DISABLED"
  | "SOURCE_NOT_PRODUCTION_ALLOWED"
  | "ACTOR_TRANSPORT_MISMATCH"
  | "INVALID_DIGEST"
  | "IDEMPOTENCY_CONFLICT"
  | "RUN_IDENTITY_CONFLICT"
  | "IMPORT_CONFLICT";

export class ListingImportError extends Error {
  override readonly name: string = "ListingImportError";

  constructor(
    readonly code: ListingImportErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class ListingImportValidationError extends ListingImportError {
  override readonly name = "ListingImportValidationError";
}

export class ListingImportConflictError extends ListingImportError {
  override readonly name = "ListingImportConflictError";

  constructor(
    code:
      | "IDEMPOTENCY_CONFLICT"
      | "RUN_IDENTITY_CONFLICT"
      | "IMPORT_CONFLICT" = "IMPORT_CONFLICT",
    message = "The import conflicts with an existing batch.",
    options?: ErrorOptions,
  ) {
    super(code, message, options);
  }
}

export class ListingImportRowError extends Error {
  override readonly name = "ListingImportRowError";

  constructor(
    readonly code: ListingImportValidationCode,
    message = "The listing row is invalid.",
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
