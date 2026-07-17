export type MediaStoreErrorCode =
  | "INVALID_SCOPE"
  | "NOT_FOUND"
  | "ACCESS_DENIED"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_ERROR";

export class MediaStoreError extends Error {
  override readonly name = "MediaStoreError";

  constructor(
    readonly code: MediaStoreErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
